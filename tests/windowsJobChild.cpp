#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <array>
#include <cstdint>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

static std::wstring quote_arg(const std::wstring& value) {
    std::wstring out = L"\"";
    size_t slashes = 0;
    for (wchar_t c : value) {
        if (c == L'\\') { ++slashes; continue; }
        if (c == L'"') {
            out.append(slashes * 2 + 1, L'\\');
            out.push_back(L'"');
            slashes = 0;
            continue;
        }
        out.append(slashes, L'\\');
        slashes = 0;
        out.push_back(c);
    }
    out.append(slashes * 2, L'\\');
    out.push_back(L'"');
    return out;
}

static std::string to_utf8(const std::wstring& value) {
    if (value.empty()) return {};
    int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), (int)value.size(), nullptr, 0, nullptr, nullptr);
    if (size <= 0) return {};
    std::string out((size_t)size, '\0');
    if (!WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), (int)value.size(), out.data(), size, nullptr, nullptr)) return {};
    return out;
}

static std::string json_string(const std::wstring& value) {
    const std::string utf8 = to_utf8(value);
    std::string out = "\"";
    for (unsigned char c : utf8) {
        if (c == '\\' || c == '"') { out.push_back('\\'); out.push_back((char)c); }
        else if (c == '\n') out += "\\n";
        else if (c == '\r') out += "\\r";
        else if (c == '\t') out += "\\t";
        else out.push_back((char)c);
    }
    out.push_back('"');
    return out;
}

static bool write_atomic(const std::wstring& path, const std::string& contents) {
    const std::wstring temporary = path + L"." + std::to_wstring(GetCurrentProcessId()) + L".tmp";
    HANDLE file = CreateFileW(temporary.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    DWORD written = 0;
    const bool ok = WriteFile(file, contents.data(), (DWORD)contents.size(), &written, nullptr)
        && written == contents.size() && FlushFileBuffers(file);
    CloseHandle(file);
    if (!ok) { DeleteFileW(temporary.c_str()); return false; }
    if (!MoveFileExW(temporary.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
        DeleteFileW(temporary.c_str());
        return false;
    }
    return true;
}

static void heartbeat(const std::wstring& path, const std::wstring& record) {
    const std::string bytes = to_utf8(record + L"\n");
    for (;;) {
        HANDLE file = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file != INVALID_HANDLE_VALUE) {
            DWORD written = 0;
            WriteFile(file, bytes.data(), (DWORD)bytes.size(), &written, nullptr);
            CloseHandle(file);
        }
        Sleep(25);
    }
}

struct Child {
    DWORD pid;
    std::wstring metadata;
    std::wstring heartbeat;
    std::wstring nonce;
    std::wstring mode;
    DWORD win32_error = ERROR_SUCCESS;
    const char* failure_phase = "unknown";
};

static bool spawn_child(const std::wstring& executable, Child& child, DWORD parent_pid) {
    std::wstring command = quote_arg(executable) + L" leaf " + quote_arg(child.metadata) + L" "
        + quote_arg(child.heartbeat) + L" " + quote_arg(child.nonce) + L" " + quote_arg(child.mode)
        + L" " + std::to_wstring(parent_pid);
    std::vector<wchar_t> mutable_command(command.begin(), command.end());
    mutable_command.push_back(L'\0');

    STARTUPINFOEXW startup = {};
    startup.StartupInfo.cb = sizeof(STARTUPINFOW);
    PROCESS_INFORMATION process = {};
    DWORD flags = CREATE_NO_WINDOW;
    BOOL inherit_handles = FALSE;
    LPPROC_THREAD_ATTRIBUTE_LIST attributes = nullptr;
    std::array<HANDLE, 3> inherited = { INVALID_HANDLE_VALUE, INVALID_HANDLE_VALUE, INVALID_HANDLE_VALUE };

    if (child.mode == L"inherited") {
        // Use dedicated inheritable handles. Node/supervisor standard handles
        // are not guaranteed to carry HANDLE_FLAG_INHERIT on every runner.
        SECURITY_ATTRIBUTES security = { sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE };
        for (HANDLE& handle : inherited) {
            handle = CreateFileW(L"NUL", GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE, &security, OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL, nullptr);
            if (handle == INVALID_HANDLE_VALUE) {
                child.win32_error = GetLastError();
                child.failure_phase = "CreateFileW(NUL)";
                for (HANDLE opened : inherited) if (opened != INVALID_HANDLE_VALUE) CloseHandle(opened);
                return false;
            }
        }
        startup.StartupInfo.cb = sizeof(startup);
        SIZE_T bytes = 0;
        if (InitializeProcThreadAttributeList(nullptr, 1, 0, &bytes) || !bytes) {
            child.win32_error = GetLastError();
            child.failure_phase = "InitializeProcThreadAttributeList(size)";
            for (HANDLE handle : inherited) CloseHandle(handle);
            return false;
        }
        attributes = (LPPROC_THREAD_ATTRIBUTE_LIST)HeapAlloc(GetProcessHeap(), 0, bytes);
        if (!attributes || !InitializeProcThreadAttributeList(attributes, 1, 0, &bytes)) {
            child.win32_error = GetLastError();
            child.failure_phase = "InitializeProcThreadAttributeList";
            if (attributes) HeapFree(GetProcessHeap(), 0, attributes);
            for (HANDLE handle : inherited) CloseHandle(handle);
            return false;
        }
        if (!UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                inherited.data(), (DWORD)(inherited.size() * sizeof(HANDLE)), nullptr, nullptr)) {
            child.win32_error = GetLastError();
            child.failure_phase = "UpdateProcThreadAttribute(HANDLE_LIST)";
            DeleteProcThreadAttributeList(attributes);
            HeapFree(GetProcessHeap(), 0, attributes);
            for (HANDLE handle : inherited) CloseHandle(handle);
            return false;
        }
        startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput = inherited[0];
        startup.StartupInfo.hStdOutput = inherited[1];
        startup.StartupInfo.hStdError = inherited[2];
        startup.lpAttributeList = attributes;
        flags |= EXTENDED_STARTUPINFO_PRESENT;
        inherit_handles = TRUE;
    } else {
        // A process created without STARTF_USESTDHANDLES can receive the
        // parent's default standard streams even when bInheritHandles is
        // FALSE. Make the isolated case explicit so it cannot accidentally
        // inherit the supervisor's standard handles.
        startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput = nullptr;
        startup.StartupInfo.hStdOutput = nullptr;
        startup.StartupInfo.hStdError = nullptr;
    }

    const BOOL created = CreateProcessW(executable.c_str(), mutable_command.data(), nullptr, nullptr,
        inherit_handles, flags, nullptr, nullptr, &startup.StartupInfo, &process);
    if (!created) {
        child.win32_error = GetLastError();
        child.failure_phase = "CreateProcessW";
    }
    if (attributes) {
        DeleteProcThreadAttributeList(attributes);
        HeapFree(GetProcessHeap(), 0, attributes);
    }
    for (HANDLE handle : inherited) if (handle != INVALID_HANDLE_VALUE) CloseHandle(handle);
    if (!created) return false;
    child.pid = process.dwProcessId;
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return true;
}

static bool has_valid_standard_handle(DWORD which) {
    HANDLE handle = GetStdHandle(which);
    DWORD flags = 0;
    return handle && handle != INVALID_HANDLE_VALUE && GetHandleInformation(handle, &flags);
}

int wmain(int argc, wchar_t* argv[]) {
    if (argc >= 3 && std::wstring(argv[1]) == L"leaf") {
        if (argc < 7) return 2;
        const std::wstring metadata_path = argv[2];
        const std::wstring heartbeat_path = argv[3];
        const std::wstring nonce = argv[4];
        const std::wstring mode = argv[5];
        const DWORD parent_pid = (DWORD)_wtoi(argv[6]);
        const bool stdin_available = has_valid_standard_handle(STD_INPUT_HANDLE);
        const bool stdout_available = has_valid_standard_handle(STD_OUTPUT_HANDLE);
        const bool stderr_available = has_valid_standard_handle(STD_ERROR_HANDLE);
        const std::string metadata = "{\"pid\":" + std::to_string(GetCurrentProcessId())
            + ",\"parentPid\":" + std::to_string(parent_pid)
            + ",\"nonce\":" + json_string(nonce) + ",\"handleMode\":" + json_string(mode)
            + ",\"standardHandlesAvailable\":[" + (stdin_available ? "true" : "false")
            + "," + (stdout_available ? "true" : "false") + "," + (stderr_available ? "true" : "false") + "]}";
        if (!write_atomic(metadata_path, metadata)) return 3;
        heartbeat(heartbeat_path, std::to_wstring(GetCurrentProcessId()) + L":" + nonce);
    }

    if (argc < 4 || std::wstring(argv[1]) != L"parent") return 2;
    const std::wstring root_metadata = argv[2];
    const std::wstring base_path = argv[3];
    wchar_t executable_buffer[32768] = {};
    DWORD executable_length = GetModuleFileNameW(nullptr, executable_buffer, (DWORD)std::size(executable_buffer));
    if (!executable_length || executable_length >= std::size(executable_buffer)) return 4;
    const std::wstring executable(executable_buffer, executable_length);

    std::vector<Child> children;
    for (const std::wstring& mode : { L"inherited", L"isolated" }) {
        const std::wstring nonce = std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()) + L"-" + mode;
        Child child = { 0, base_path + L"-" + mode + L".json", base_path + L"-" + mode + L".heartbeat", nonce, mode };
        if (!spawn_child(executable, child, GetCurrentProcessId())) {
            std::cerr << "Could not create " << (child.mode == L"inherited" ? "inherited" : "isolated")
                << " descendant during " << child.failure_phase << " (Win32 " << child.win32_error << ")\n";
            return 5;
        }
        children.push_back(child);
    }

    std::string root = "{\"pid\":" + std::to_string(GetCurrentProcessId()) + ",\"children\":[";
    for (size_t i = 0; i < children.size(); ++i) {
        if (i) root += ",";
        const Child& child = children[i];
        root += "{\"pid\":" + std::to_string(child.pid) + ",\"metadata\":" + json_string(child.metadata)
            + ",\"heartbeat\":" + json_string(child.heartbeat) + ",\"nonce\":" + json_string(child.nonce)
            + ",\"handleMode\":" + json_string(child.mode) + "}";
    }
    root += "]}";
    if (!write_atomic(root_metadata, root)) return 6;
    Sleep(INFINITE);
    return 0;
}
