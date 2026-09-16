param([Parameter(Mandatory=$true)][string]$Pdf)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SwiftLocalShell {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Info {
    public uint cbSize, fMask; public IntPtr hwnd;
    public string lpVerb, lpFile, lpParameters, lpDirectory;
    public int nShow; public IntPtr hInstApp, lpIDList;
    public string lpClass; public IntPtr hkeyClass;
    public uint dwHotKey; public IntPtr hIcon, hProcess;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool ShellExecuteEx(ref Info info);
}
'@
$info = New-Object SwiftLocalShell+Info
$info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
# This helper has no message loop and exits after launching the document.
# https://learn.microsoft.com/windows/win32/api/shellapi/ns-shellapi-shellexecuteinfow
$info.fMask = 0x101 # SEE_MASK_CLASSNAME | SEE_MASK_NOASYNC
$info.lpVerb = 'open'
$info.lpFile = $Pdf
$info.lpClass = 'SwiftLocal.PDF'
$info.nShow = 1
if (-not [SwiftLocalShell]::ShellExecuteEx([ref]$info)) {
  throw "ShellExecuteEx failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}
