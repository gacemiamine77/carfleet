@echo off
setlocal

if "%~1"=="" (
echo.
echo Usage : p "message du commit"
echo Exemple : p "changement 1"
echo.
exit /b 1
)

echo.
echo === Ajout des fichiers ===
git add .

if errorlevel 1 (
echo ERREUR lors de git add.
exit /b 1
)

echo.
echo === Commit : %~1 ===
git commit -m "%~1"

if errorlevel 1 (
echo.
echo Aucun commit effectue ou erreur de commit.
exit /b 1
)

echo.
echo === Envoi vers GitHub ===
git push

if errorlevel 1 (
echo.
echo ERREUR lors du git push.
exit /b 1
)

echo.
echo ========================================
echo   Commit et push termines avec succes
echo ========================================
echo.

endlocal
