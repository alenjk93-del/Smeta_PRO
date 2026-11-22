; SmetaPRO PC installer (NSIS) — per-user, без прав администратора.
; Собирается нативным Linux makensis: makensis installer.nsi
; Начинка: dist\win-unpacked (electron-builder --win --dir).
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

; Нагрузка кладётся ОДНИМ zip-архивом (dist/payload.zip — содержимое
; win-unpacked) и распаковывается при установке через 7za.exe:
; Linux-makensis 3.09 на этой машине умирает (SIGBUS/SIGSEGV) при
; сжатии дерева файлов целиком, а SetCompress off + один файл —
; проходит стабильно. Пути к файлам — буквальные абсолютные,
; прямыми слэшами (другие формы тоже роняли makensis).

!define APPNAME "Смета PRO"
!define APPVER "1.11.26"
!define EXENAME "Смета PRO.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SmetaPRO-PC"

Name "${APPNAME}"
OutFile "dist/SmetaPRO-PC-Setup-v${APPVER}.exe"
InstallDir "$LOCALAPPDATA\Programs\SmetaPRO"
InstallDirRegKey HKCU "Software\SmetaPRO-PC" "InstallDir"
RequestExecutionLevel user
SetCompress off

!define MUI_ABORTWARNING
!define MUI_ICON "build\icon-installer.ico"
!define MUI_UNICON "build\icon-installer.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Russian"

Section "Install"
  CreateDirectory "$INSTDIR"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "/home/hatch/workspace/smetapro-pc/payload-tools/7za.exe"
  File "/home/hatch/workspace/smetapro-pc/dist/payload.zip"
  DetailPrint "Распаковка файлов программы…"
  nsExec::ExecToLog '"$PLUGINSDIR\7za.exe" x "$PLUGINSDIR\payload.zip" -o"$INSTDIR" -y -bb0'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Не удалось распаковать файлы программы (код $0). Установка прервана."
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"

  WriteRegStr HKCU "Software\SmetaPRO-PC" "InstallDir" "$INSTDIR"

  ; Ярлыки
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Удалить ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"

  ; Деинсталлятор и запись в «Приложения»
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${APPVER}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Smeta PRO"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  ; Ассоциации файлов (открытие в программе двойным щелчком)
  WriteRegStr HKCU "Software\Classes\.smetabook" "" "SmetaPROBook"
  WriteRegStr HKCU "Software\Classes\SmetaPROBook" "" "Прайс-лист / книга SmetaPRO"
  WriteRegStr HKCU "Software\Classes\SmetaPROBook\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\SmetaPROBook\shell\open\command" "" '"$INSTDIR\${EXENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\.smetaest" "" "SmetaPROEstimate"
  WriteRegStr HKCU "Software\Classes\SmetaPROEstimate" "" "Смета SmetaPRO"
  WriteRegStr HKCU "Software\Classes\SmetaPROEstimate\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\SmetaPROEstimate\shell\open\command" "" '"$INSTDIR\${EXENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\.smetatpl" "" "SmetaPROTemplate"
  WriteRegStr HKCU "Software\Classes\SmetaPROTemplate" "" "Шаблон сметы SmetaPRO"
  WriteRegStr HKCU "Software\Classes\SmetaPROTemplate\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\SmetaPROTemplate\shell\open\command" "" '"$INSTDIR\${EXENAME}" "%1"'
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\SmetaPRO-PC"
  DeleteRegKey HKCU "Software\Classes\.smetabook"
  DeleteRegKey HKCU "Software\Classes\SmetaPROBook"
  DeleteRegKey HKCU "Software\Classes\.smetaest"
  DeleteRegKey HKCU "Software\Classes\SmetaPROEstimate"
  DeleteRegKey HKCU "Software\Classes\.smetatpl"
  DeleteRegKey HKCU "Software\Classes\SmetaPROTemplate"
  ; Данные пользователя (%APPDATA%\Смета PRO) при удалении НЕ трогаем.
SectionEnd
