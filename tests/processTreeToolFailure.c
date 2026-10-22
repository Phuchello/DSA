#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void write_marker(const char *path, const char *value) {
    if (!path || !*path) return;
    FILE *file = fopen(path, "wb");
    if (file) {
        fputs(value, file);
        fclose(file);
    }
}

static int wait_for_file(const char *path, DWORD timeout_ms) {
    DWORD started = GetTickCount();
    while ((DWORD)(GetTickCount() - started) < timeout_ms) {
        if (path && GetFileAttributesA(path) != INVALID_FILE_ATTRIBUTES) return 1;
        Sleep(10);
    }
    return path && GetFileAttributesA(path) != INVALID_FILE_ATTRIBUTES;
}

static int read_child_pid(const char *path) {
    char buffer[1024] = {0};
    FILE *file = fopen(path, "rb");
    if (!file) return 0;
    size_t length = fread(buffer, 1, sizeof(buffer) - 1, file);
    fclose(file);
    buffer[length] = '\0';
    char *key = strstr(buffer, "\"pid\":");
    return key ? atoi(key + 6) : 0;
}

static int argument_pid(int argc, char **argv) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (strcmp(argv[i], "/PID") == 0) return atoi(argv[i + 1]);
    }
    return 0;
}

static void record_late_child_identity(const char *ready_path, const char *identity_path) {
    int pid = read_child_pid(ready_path);
    if (pid <= 0) return;
    HANDLE child = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, (DWORD)pid);
    if (!child) return;
    FILETIME creation, exit_time, kernel, user;
    if (GetProcessTimes(child, &creation, &exit_time, &kernel, &user)
        && WaitForSingleObject(child, 0) == WAIT_TIMEOUT) {
        unsigned long long identity =
            ((unsigned long long)creation.dwHighDateTime << 32) | creation.dwLowDateTime;
        char value[128];
        sprintf(value, "%d:%llu", pid, identity);
        write_marker(identity_path, value);
    }
    CloseHandle(child);
}

int main(int argc, char **argv) {
    const char *failure_marker = getenv("FLOWLAB_TOOL_FAILURE_MARKER");
    if (failure_marker && *failure_marker) write_marker(failure_marker, "injected taskkill failure\\n");

    const char *trigger = getenv("FLOWLAB_TEST_LATE_CHILD_TRIGGER_FILE");
    const char *ready = getenv("FLOWLAB_TEST_LATE_CHILD_READY_FILE");
    const char *identity = getenv("FLOWLAB_TEST_LATE_CHILD_IDENTITY_FILE");
    const char *allow_root_kill = getenv("FLOWLAB_TEST_ALLOW_ROOT_KILL_FILE");
    const char *snapshot_complete = getenv("FLOWLAB_TEST_SNAPSHOT_COMPLETED_FILE");
    if (trigger && ready && identity && allow_root_kill && snapshot_complete) {
        // This executable is reached only after the production helper's initial
        // Toolhelp snapshot has returned. The marker/handshake orders the race.
        write_marker(snapshot_complete, "initial-snapshot-complete");
        write_marker(trigger, "spawn-late-child");
        if (!wait_for_file(ready, 7000)) return 31;
        record_late_child_identity(ready, identity);
        if (!wait_for_file(allow_root_kill, 7000)) return 32;

        const int root_pid = argument_pid(argc, argv);
        if (root_pid <= 0) return 33;
        HANDLE root = OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, FALSE, (DWORD)root_pid);
        if (!root) return 34;
        if (!TerminateProcess(root, 137)) {
            CloseHandle(root);
            return 35;
        }
        WaitForSingleObject(root, 1500);
        CloseHandle(root);
    }
    return 23;
}
