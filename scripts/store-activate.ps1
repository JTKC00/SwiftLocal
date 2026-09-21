param([Parameter(Mandatory=$true)][string]$Aumid, [string]$Arguments = '')
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IActivationManager {
  [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string app,
    [MarshalAs(UnmanagedType.LPWStr)] string args, uint options, out uint pid);
}
public static class StoreActivation {
  public static uint Start(string app, string args) {
    var type = Type.GetTypeFromCLSID(new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C"));
    var manager = (IActivationManager)Activator.CreateInstance(type);
    uint pid; int hr = manager.ActivateApplication(app, args, 0, out pid);
    Marshal.ThrowExceptionForHR(hr); return pid;
  }
}
'@
[StoreActivation]::Start($Aumid, $Arguments)
