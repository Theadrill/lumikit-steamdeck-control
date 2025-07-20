!macro customInstall
  SetOutPath "$APPDATA\${APP_NAME}"
  File "${BUILD_RESOURCES_DIR}\config.json"
!macroend
