@echo off
chcp 65001 >nul
rem Если скрипт свалится на разборе, окно не должно закрыться молча:
rem перехватываем выход и ждём нажатия клавиши.
if "%~1"=="" (
  cmd /c ""%~f0" run"
  echo.
  echo   !M_CLOSE!
  pause >nul
  exit /b
)
title SiliconSense Студия — локальная сборка
cd /d "%~dp0"
setlocal enabledelayedexpansion

rem ---------- язык ----------
rem Берём язык интерфейса Windows. Не определился — говорим по-английски.
rem Принудительно: set SS_LANG=ru перед запуском.
set "UIC="
for /f "usebackq tokens=*" %%L in (`powershell -NoProfile -Command "(Get-UICulture).TwoLetterISOLanguageName" 2^>nul`) do set "UIC=%%L"
if defined SS_LANG goto :lang_pick
set "SS_LANG=en"
if /i "!UIC!"=="ru" set "SS_LANG=ru"
:lang_pick
if /i not "!SS_LANG!"=="ru" set "SS_LANG=en"
if "!SS_LANG!"=="ru" goto :lang_ru
set "M_CLOSE=You can close this window."
set "M_TITLE= SiliconSense Studio — songs on your own graphics card"
set "M_REQ1=For NVIDIA graphics cards with 6 GB or more."
set "M_REQ2=The first run downloads about 7 GB and takes a while."
set "M_NOSMI1=[error] nvidia-smi was not found."
set "M_NOSMI2=An NVIDIA card and a current driver are required:"
set "M_GPU=[1/6] Graphics card:"
set "M_DRV=driver"
set "M_BUILD=build"
set "M_OLDDRV=old driver, the fast kernels of the engine will stay off"
set "M_UV1=[2/6] Downloading the environment installer..."
set "M_UVERR=[error] Download failed. Check your internet connection and antivirus."
set "M_UVOK=[2/6] Environment installer already in place."
set "M_PY1=[3/6] Installing Python 3.12..."
set "M_PYERR=[error] Could not create the environment."
set "M_PYOK=[3/6] Environment already prepared."
set "M_ENG1=[4/6] Downloading the engine..."
set "M_GITERR=[error] git is required: https://git-scm.com/download/win"
set "M_ENGERR=[error] Could not download the engine."
set "M_ENGOK=[4/6] Engine already in place."
set "M_LIB1=[5/6] Installing the engine libraries..."
set "M_LIBERR=[error] The engine libraries failed to install."
set "M_TORCH=[5/6] Installing PyTorch with graphics card support — the longest part..."
set "M_TORCHERR=[error] PyTorch with CUDA support failed to install."
set "M_HFERR=[error] The model downloader failed to install."
set "M_TRI=[5/6] Installing an accelerator, it is optional..."
set "M_TRINO=not installed, continuing without it"
set "M_TRIOK=installed"
set "M_CHK=[5/6] Checking whether PyTorch sees your card..."
set "M_CHKERR1=[error] PyTorch is installed but does not see the graphics card."
set "M_CHKERR2=Run check.bat and send us its output. Downloading the models"
set "M_CHKERR3=makes no sense until this is fixed."
set "M_LIBOK=[5/6] Libraries already installed."
set "M_MDL1=[6/6] Downloading models, about 6 GB. A dropped connection is not a problem:"
set "M_MDL2=what is downloaded is kept and it resumes where it stopped."
set "M_MDLERR=[error] The models did not finish downloading. Run this file again."
set "M_MDLOK=[6/6] Models already downloaded."
set "M_RUN1=Starting the studio. A browser window will open by itself."
set "M_RUN2=To shut it down, close this black window."
set "M_STOP=The studio has stopped."
goto :lang_done
:lang_ru
set "M_CLOSE=Окно можно закрывать."
set "M_TITLE= SiliconSense Студия — песни на своей видеокарте"
set "M_REQ1=Для видеокарт NVIDIA от 6 ГБ."
set "M_REQ2=Первый запуск скачает около 7 ГБ и займёт время."
set "M_NOSMI1=[ошибка] nvidia-smi не найдена."
set "M_NOSMI2=Нужна видеокарта NVIDIA и свежий драйвер:"
set "M_GPU=[1/6] Видеокарта:"
set "M_DRV=драйвер"
set "M_BUILD=сборка"
set "M_OLDDRV=драйвер старый, быстрые ядра движка будут недоступны"
set "M_UV1=[2/6] Качаю установщик окружения..."
set "M_UVERR=[ошибка] Не удалось скачать. Проверьте интернет и антивирус."
set "M_UVOK=[2/6] Установщик окружения уже на месте."
set "M_PY1=[3/6] Ставлю Python 3.12..."
set "M_PYERR=[ошибка] Не удалось создать окружение."
set "M_PYOK=[3/6] Окружение уже готово."
set "M_ENG1=[4/6] Качаю движок..."
set "M_GITERR=[ошибка] Нужен git: https://git-scm.com/download/win"
set "M_ENGERR=[ошибка] Не удалось скачать движок."
set "M_ENGOK=[4/6] Движок уже на месте."
set "M_LIB1=[5/6] Ставлю библиотеки движка..."
set "M_LIBERR=[ошибка] Библиотеки движка не встали."
set "M_TORCH=[5/6] Ставлю PyTorch с поддержкой видеокарты — самая долгая часть..."
set "M_TORCHERR=[ошибка] Не встал PyTorch с поддержкой CUDA."
set "M_HFERR=[ошибка] Не встал загрузчик моделей."
set "M_TRI=[5/6] Ставлю ускоритель, он необязателен..."
set "M_TRINO=не встал, работаем без него"
set "M_TRIOK=поставлен"
set "M_CHK=[5/6] Проверяю, видит ли PyTorch вашу карту..."
set "M_CHKERR1=[ошибка] PyTorch установлен, но видеокарту не видит."
set "M_CHKERR2=Запустите check.bat и пришлите вывод — качать модели"
set "M_CHKERR3=нет смысла, пока это не решено."
set "M_LIBOK=[5/6] Библиотеки уже стоят."
set "M_MDL1=[6/6] Качаю модели, около 6 ГБ. Обрыв связи не страшен:"
set "M_MDL2=скачанное сохраняется, докачка идёт с места обрыва."
set "M_MDLERR=[ошибка] Модели не докачались. Запустите файл ещё раз."
set "M_MDLOK=[6/6] Модели уже скачаны."
set "M_RUN1=Запускаю студию. Окно браузера откроется само."
set "M_RUN2=Чтобы выключить — закройте это чёрное окно."
set "M_STOP=Студия остановлена."
:lang_done
echo.
echo   ===============================================
echo   !M_TITLE!
echo   ===============================================
echo.
echo   !M_REQ1!
echo   !M_REQ2!
echo.

rem ---------- 1. видеокарта ----------
where nvidia-smi >nul 2>&1
if errorlevel 1 (
  echo   !M_NOSMI1!
  echo       !M_NOSMI2!
  echo       https://www.nvidia.com/download/index.aspx
  echo.
  pause & exit /b 1
)
echo   !M_GPU!
for /f "skip=1 tokens=*" %%g in ('nvidia-smi --query-gpu^=name^,memory.total^,driver_version --format^=csv') do (
  if not "%%g"=="" echo         %%g
)

rem Какую сборку PyTorch ставить. Движок в логе прямо пишет: без CUDA 13 он
rem выключает свои быстрые ядра и считает медленным запасным путём. CUDA 13
rem работает с драйвером от 580, на старых драйверах карта просто не заведётся,
rem поэтому там остаётся прежняя сборка.
set "TORCH_INDEX=cu128"
set "DRVMAJ=0"
for /f "skip=1 tokens=1 delims=." %%d in ('nvidia-smi --query-gpu^=driver_version --format^=csv') do (
  if "!DRVMAJ!"=="0" set "DRVMAJ=%%d"
)
rem Версии закреплены: именно этот набор проверен и даёт реальное время
rem на 4050 6 ГБ. Без закрепления установщик берёт свежайшее, и завтра
rem на чужой машине соберётся другой набор, который никто не проверял.
set "TORCH_PKGS=torch==2.11.0 torchvision==0.26.0 torchaudio==2.11.0"
if !DRVMAJ! GEQ 580 set "TORCH_INDEX=cu130"
if !DRVMAJ! GEQ 580 set "TORCH_PKGS=torch==2.14.0 torchvision==0.29.0 torchaudio==2.11.0"
echo         !M_DRV! !DRVMAJ!, !M_BUILD! !TORCH_INDEX!
if "!TORCH_INDEX!"=="cu128" echo         !M_OLDDRV!
echo.

rem ---------- 2. установщик окружения ----------
if not exist "tools\uv.exe" (
  echo   !M_UV1!
  if not exist tools mkdir tools
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; try { Invoke-WebRequest -UseBasicParsing 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip' -OutFile 'tools\uv.zip'; Expand-Archive -Force 'tools\uv.zip' 'tools'; Remove-Item 'tools\uv.zip' } catch { Write-Host $_.Exception.Message; exit 1 }"
  if errorlevel 1 ( echo   !M_UVERR! & pause & exit /b 1 )
) else ( echo   !M_UVOK! )

rem ---------- 3. Python ----------
if not exist ".venv\Scripts\python.exe" (
  echo   !M_PY1!
  tools\uv.exe venv --python 3.12 .venv
  if errorlevel 1 ( echo   !M_PYERR! & pause & exit /b 1 )
) else ( echo   !M_PYOK! )
set "PY=%~dp0.venv\Scripts\python.exe"

rem ---------- 4. движок ----------
rem Считает ComfyUI: у него родная поддержка нашей модели и, в отличие от
rem официального пакета, он не требует flash attention, которого под Windows нет.
if not exist "engine\main.py" (
  echo   !M_ENG1!
  where git >nul 2>&1
  if errorlevel 1 (
    echo   !M_GITERR!
    pause & exit /b 1
  )
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI engine
  if errorlevel 1 ( echo   !M_ENGERR! & pause & exit /b 1 )
) else ( echo   !M_ENGOK! )

rem ---------- 5. библиотеки ----------
rem ПОРЯДОК ВАЖЕН. Зависимости движка тянут torch с общего хранилища, где для
rem Windows лежит ПРОЦЕССОРНАЯ сборка. Поэтому torch с поддержкой видеокарты
rem ставим ПОСЛЕДНИМ и поверх — иначе карта не видна (проверено на горьком опыте).
if not exist ".venv\.installed-v4" (
  echo   !M_LIB1!
  tools\uv.exe pip install --python "%PY%" -r engine\requirements.txt
  if errorlevel 1 ( echo   !M_LIBERR! & pause & exit /b 1 )

  echo   !M_TORCH!
  rem Три пакета СТРОГО ВМЕСТЕ и из одного места. torchvision и torchaudio собраны
  rem под конкретную версию torch: заменишь один, а остальные останутся от общего
  rem хранилища — и получишь «точка входа не найдена в DLL» при запуске.
  tools\uv.exe pip install --python "%PY%" --reinstall-package torch --reinstall-package torchvision --reinstall-package torchaudio !TORCH_PKGS! --index-url https://download.pytorch.org/whl/!TORCH_INDEX!
  if errorlevel 1 ( echo   !M_TORCHERR! & pause & exit /b 1 )

  tools\uv.exe pip install --python "%PY%" "huggingface_hub[hf_xet]"
  if errorlevel 1 ( echo   !M_HFERR! & pause & exit /b 1 )

  rem Ускоритель целочисленных вычислений. Модель у нас в int8, и движок сам пишет
  rem в логе, что без него идёт менее выгодным путём. Под Windows это отдельный пакет.
  rem Не встанет — не беда: движок просто продолжит как раньше, поэтому ошибку глушим.
  echo   !M_TRI!
  tools\uv.exe pip install --python "%PY%" triton-windows
  if errorlevel 1 echo         !M_TRINO!
  if not errorlevel 1 echo         !M_TRIOK!

  echo   !M_CHK!
  "%PY%" -c "import torch,torchvision,torchaudio,sys; ok=torch.cuda.is_available(); print('   torch',torch.__version__,'| vision',torchvision.__version__,'| audio',torchaudio.__version__); print('   CUDA:',ok); sys.exit(0 if ok else 3)"
  if errorlevel 1 (
    echo.
    echo   !M_CHKERR1!
    echo       !M_CHKERR2!
    echo       !M_CHKERR3!
    pause & exit /b 1
  )
  echo. > ".venv\.installed-v4"
) else ( echo   !M_LIBOK! )

rem ---------- 6. модели ----------
if not exist "engine\models\.done" (
  echo   !M_MDL1!
  echo         !M_MDL2!
  "%PY%" download.py
  if errorlevel 1 (
    echo   !M_MDLERR!
    pause & exit /b 1
  )
) else ( echo   !M_MDLOK! )

echo.
echo   !M_RUN1!
echo   !M_RUN2!
echo.
"%PY%" server.py
echo.
echo   !M_STOP!
pause
