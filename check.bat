@echo off
chcp 65001 >nul
title SiliconSense Studio — check
cd /d "%~dp0"
setlocal enabledelayedexpansion

set "UIC="
for /f "usebackq tokens=*" %%L in (`powershell -NoProfile -Command "(Get-UICulture).TwoLetterISOLanguageName" 2^>nul`) do set "UIC=%%L"
if defined SS_LANG goto :pick
set "SS_LANG=en"
if /i "!UIC!"=="ru" set "SS_LANG=ru"
:pick
if /i not "!SS_LANG!"=="ru" set "SS_LANG=en"
if "!SS_LANG!"=="ru" goto :ru
set "C_HEAD=CHECK. Please send the whole text below."
set "C_DRV=--- driver and CUDA version ---"
set "C_TORCH=--- what PyTorch sees ---"
set "C_NOENV=Environment not found. Run start.bat first."
set "C_WHY=--- why it may not see the card ---"
set "C_TAIL=Copy the text above and send it to us."
goto :go
:ru
set "C_HEAD=ПРОВЕРКА. Пришлите весь текст ниже целиком."
set "C_DRV=--- драйвер и версия CUDA ---"
set "C_TORCH=--- что видит PyTorch ---"
set "C_NOENV=Окружение не найдено. Сначала запустите start.bat"
set "C_WHY=--- почему может не видеть карту ---"
set "C_TAIL=Скопируйте текст выше и пришлите нам."
:go

echo.
echo   !C_HEAD!
echo   ==========================================
echo.
echo   !C_DRV!
nvidia-smi
echo.
echo   !C_TORCH!
if not exist ".venv\Scripts\python.exe" (
  echo   !C_NOENV!
  pause & exit /b 1
)
".venv\Scripts\python.exe" -c "import torch;print('torch:',torch.__version__);print('built for CUDA:',torch.version.cuda);print('sees the card:',torch.cuda.is_available());print('cards:',torch.cuda.device_count());  [print('name:',torch.cuda.get_device_name(0)) if torch.cuda.is_available() else None]"
echo.
echo   !C_WHY!
".venv\Scripts\python.exe" -c "import torch;  print('this build has NO CUDA support, that is the cause') if torch.version.cuda is None else None;  torch.cuda.init() if not torch.cuda.is_available() else print('all good')" 2>&1
echo.
echo   ==========================================
echo   !C_TAIL!
pause
