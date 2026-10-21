param(
    [Parameter(Mandatory = $true)][int]$RootPid,
    [Parameter(Mandatory = $true)][string]$TaskkillExecutable,
    [switch]$DisableFallback
)

$ErrorActionPreference = 'Stop'
$primaryError = ''
$fallbackUsed = $false
$primarySucceeded = $false
$captured = @{}
$lastReason = ''

try {
    $nativeSource = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;

public sealed class FlowLabProcessEntry {
    public int Pid { get; set; }
    public int ParentPid { get; set; }
    public long Creation { get; set; }
}

public static class FlowLabProcessTreeNative {
    private const uint TH32CS_SNAPPROCESS = 0x00000002;
    private const uint PROCESS_TERMINATE = 0x0001;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private const uint SYNCHRONIZE = 0x00100000;
    private const uint WAIT_OBJECT_0 = 0;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PROCESSENTRY32 {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FILETIME { public uint Low; public uint High; }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32 entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32 entry);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetProcessTimes(IntPtr process, out FILETIME creation, out FILETIME exit, out FILETIME kernel, out FILETIME user);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    public static FlowLabProcessEntry[] Snapshot() {
        IntPtr snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snapshot == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateToolhelp32Snapshot failed");
        var entries = new List<FlowLabProcessEntry>();
        try {
            var entry = new PROCESSENTRY32();
            entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
            if (!Process32FirstW(snapshot, ref entry)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Process32First failed");
            do {
                entries.Add(new FlowLabProcessEntry { Pid = (int)entry.th32ProcessID, ParentPid = (int)entry.th32ParentProcessID });
                entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
            } while (Process32NextW(snapshot, ref entry));
        } finally { CloseHandle(snapshot); }
        return entries.ToArray();
    }

    private static long? TryCreation(int pid, out IntPtr handle) {
        handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, (uint)pid);
        if (handle == IntPtr.Zero) {
            int error = Marshal.GetLastWin32Error();
            if (error == 87 || error == 1168) return null; // The process exited between the snapshot and open.
            throw new Win32Exception(error, "OpenProcess(query) failed for PID " + pid);
        }
        FILETIME creation, exit, kernel, user;
        if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)) {
            int error = Marshal.GetLastWin32Error();
            CloseHandle(handle);
            handle = IntPtr.Zero;
            if (error == 87 || error == 1168) return null;
            throw new Win32Exception(error, "GetProcessTimes failed for PID " + pid);
        }
        return ((long)creation.High << 32) | creation.Low;
    }

    public static long? Creation(int pid) {
        IntPtr handle;
        long? creation = TryCreation(pid, out handle);
        if (handle != IntPtr.Zero) CloseHandle(handle);
        return creation;
    }

    public static bool IsSameProcess(int pid, long creation) {
        IntPtr handle;
        long? current = TryCreation(pid, out handle);
        if (handle != IntPtr.Zero) CloseHandle(handle);
        return current.HasValue && current.Value == creation;
    }

    public static bool TerminateExact(int pid, long creation) {
        IntPtr handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | SYNCHRONIZE, false, (uint)pid);
        if (handle == IntPtr.Zero) {
            int error = Marshal.GetLastWin32Error();
            if (error == 87 || error == 1168) return true;
            throw new Win32Exception(error, "OpenProcess(terminate) failed for PID " + pid);
        }
        try {
            FILETIME current, exit, kernel, user;
            if (!GetProcessTimes(handle, out current, out exit, out kernel, out user)) {
                int error = Marshal.GetLastWin32Error();
                if (error == 87 || error == 1168) return true;
                throw new Win32Exception(error, "GetProcessTimes before terminate failed for PID " + pid);
            }
            long currentCreation = ((long)current.High << 32) | current.Low;
            if (currentCreation != creation) return true; // PID has been reused; never kill the unrelated process.
            if (!TerminateProcess(handle, 137)) {
                int error = Marshal.GetLastWin32Error();
                if (error != 5 && error != 87 && error != 1168) throw new Win32Exception(error, "TerminateProcess failed for PID " + pid);
            }
            return WaitForSingleObject(handle, 0) == WAIT_OBJECT_0;
        } finally { CloseHandle(handle); }
    }
}
'@
    Add-Type -TypeDefinition $nativeSource -Language CSharp

    function Get-CurrentTree {
        $snapshot = [FlowLabProcessTreeNative]::Snapshot()
        $rootEntry = @($snapshot | Where-Object { $_.Pid -eq $RootPid } | Select-Object -First 1)
        if (-not $captured.ContainsKey([string]$RootPid)) {
            if ($rootEntry.Count -eq 0) {
                throw "Root PID $RootPid was absent from the initial process snapshot; refusing to risk killing a reused PID"
            }
            $rootCreation = [FlowLabProcessTreeNative]::Creation($RootPid)
            if ($null -eq $rootCreation) { throw "Could not capture the creation identity for root PID $RootPid" }
            $captured[[string]$RootPid] = [long]$rootCreation
        }
        $known = @{}
        $tree = New-Object 'System.Collections.Generic.List[object]'
        foreach ($key in @($captured.Keys)) {
            $creation = [long]$captured[$key]
            $matchingEntry = @($snapshot | Where-Object { $_.Pid -eq [int]$key } | Select-Object -First 1)
            if ($matchingEntry.Count -gt 0 -and [FlowLabProcessTreeNative]::IsSameProcess([int]$key, $creation)) {
                $known[[string]$key] = $true
            }
        }
        $changed = $true
        while ($changed) {
            $changed = $false
            foreach ($entry in $snapshot) {
                $pidKey = [string]$entry.Pid
                if (-not $known.ContainsKey([string]$entry.ParentPid) -or $known.ContainsKey($pidKey)) { continue }
                $known[$pidKey] = $true
                $creation = [FlowLabProcessTreeNative]::Creation($entry.Pid)
                if ($null -ne $creation) {
                    $item = [pscustomobject]@{ Pid = $entry.Pid; ParentPid = $entry.ParentPid; Creation = [long]$creation }
                    $tree.Add($item)
                    $captured[$pidKey] = [long]$creation
                }
                $changed = $true
            }
        }
        return @($tree.ToArray())
    }

    $initialTree = @(Get-CurrentTree)
    $primaryError = ''
    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $TaskkillExecutable
        $startInfo.Arguments = "/PID $RootPid /T /F"
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $killer = New-Object System.Diagnostics.Process
        $killer.StartInfo = $startInfo
        if (-not $killer.Start()) { throw 'taskkill helper process did not start' }
        $stdoutTask = $killer.StandardOutput.ReadToEndAsync()
        $stderrTask = $killer.StandardError.ReadToEndAsync()
        if (-not $killer.WaitForExit(2500)) {
            try { $killer.Kill() } catch { }
            $killer.WaitForExit(1000) | Out-Null
            $stdout = if ($stdoutTask.IsCompleted) { $stdoutTask.Result } else { '' }
            $stderr = if ($stderrTask.IsCompleted) { $stderrTask.Result } else { '' }
            throw "taskkill exceeded its 2.5s limit; stdout=$stdout stderr=$stderr"
        }
        if ($killer.ExitCode -ne 0) {
            throw "taskkill exit=$($killer.ExitCode); stdout=$($stdoutTask.Result) stderr=$($stderrTask.Result)"
        }
        $primarySucceeded = $true
    } catch {
        $primaryError = $_.Exception.Message
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    $verified = $false
    $fallbackUsed = -not $primarySucceeded
    $remaining = @()
    do {
        $currentTree = @(Get-CurrentTree)
        $liveCaptured = New-Object 'System.Collections.Generic.List[object]'
        foreach ($key in @($captured.Keys)) {
            $creation = [long]$captured[$key]
            if ([FlowLabProcessTreeNative]::IsSameProcess([int]$key, $creation)) {
                $liveCaptured.Add([pscustomobject]@{ Pid = [int]$key; Creation = $creation })
            }
        }
        if ($currentTree.Count -eq 0 -and $liveCaptured.Count -eq 0) {
            $verified = $true
            break
        }
        if (-not $DisableFallback) {
            if ($liveCaptured.Count -gt 0) { $fallbackUsed = $true }
            foreach ($entry in $liveCaptured) {
                try {
                    if (-not [FlowLabProcessTreeNative]::TerminateExact($entry.Pid, $entry.Creation)) {
                        $lastReason = "PID $($entry.Pid) did not signal exit within 1.5s"
                    }
                } catch { $lastReason = $_.Exception.Message }
            }
        }
        $remaining = @($liveCaptured | ForEach-Object { [pscustomobject]@{ pid = $_.Pid; creation = [string]$_.Creation } })
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)

    if (-not $verified) {
        $currentTree = @(Get-CurrentTree)
        $remaining = @($currentTree | ForEach-Object { [pscustomobject]@{ pid = $_.Pid; creation = [string]$_.Creation } })
        foreach ($key in @($captured.Keys)) {
            $creation = [long]$captured[$key]
            if ([FlowLabProcessTreeNative]::IsSameProcess([int]$key, $creation) -and -not ($remaining | Where-Object { $_.pid -eq [int]$key })) {
                $remaining += [pscustomobject]@{ pid = [int]$key; creation = [string]$creation }
            }
        }
        if (-not $lastReason) { $lastReason = 'captured process identities remained after the 5s shutdown deadline' }
    }

    $output = [pscustomobject]@{
        verified = $verified
        fallbackUsed = $fallbackUsed
        primaryError = $primaryError
        primaryExecutable = $TaskkillExecutable
        reason = if ($verified) { '' } else { $lastReason }
        remaining = @($remaining)
    }
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $output -Compress -Depth 4))
    if ($verified) { exit 0 } else { exit 3 }
} catch {
    $failure = [pscustomobject]@{
        verified = $false
        fallbackUsed = $fallbackUsed
        primaryError = $primaryError
        primaryExecutable = $TaskkillExecutable
        reason = $_.Exception.ToString()
        remaining = @()
    }
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $failure -Compress -Depth 4))
    exit 4
}

