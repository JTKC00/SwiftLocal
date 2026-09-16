; Register an Open With choice without replacing the user's PDF default.
!macro customInstall
  WriteRegNone SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "SwiftLocal.PDF"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SwiftLocal.PDF" "" "PDF Document - SwiftLocal"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SwiftLocal.PDF\DefaultIcon" "" '"$INSTDIR\SwiftLocal.exe",0'
  WriteRegStr SHELL_CONTEXT "Software\Classes\SwiftLocal.PDF\shell\open\command" "" '"$INSTDIR\SwiftLocal.exe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\SwiftLocal.exe" "FriendlyAppName" "SwiftLocal"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\SwiftLocal.exe\SupportedTypes" ".pdf" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\SwiftLocal.exe\shell\open\command" "" '"$INSTDIR\SwiftLocal.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "SwiftLocal.PDF"
  DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\SwiftLocal.PDF"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\SwiftLocal.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
