@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

rem ============================================================
rem AirFlow Select - GitHub one-click bootstrap v1.3.0
rem ASCII-only CMD. Repository-not-found is a normal create case.
rem ============================================================
set "REPO_NAME=airflow-blower-selector"
set "REPO_VISIBILITY=public"
set "REPO_DESCRIPTION=Industrial air blower and nozzle sizing calculator with engineering reports"
set "REPO_TOPICS=github-pages,blower,engineering-calculator,air-knife,nozzle,static-site,vanilla-js"
set "DEFAULT_BRANCH=main"
set "INITIAL_TAG=v1.3.0"
set "INITIAL_COMMIT=feat: launch AirFlow Select"
set "UPDATE_COMMIT=chore: update AirFlow Select"
set "OPEN_AFTER_DEPLOY=1"
rem ============================================================

set "DEPLOY_OK=0"
set "NODE_OK=0"

echo.
echo ============================================================
echo  AirFlow Select - GitHub Bootstrap v1.3.0
echo ============================================================
echo  Project: %CD%
echo.

if not exist "index.html" (
  echo [ERROR] index.html was not found.
  echo         Run this CMD from the AirFlow Select project root.
  goto :fatal
)
if not exist ".github\workflows\deploy.yml" (
  echo [ERROR] .github\workflows\deploy.yml was not found.
  goto :fatal
)

call :check_required git Git.Git "Git"
if errorlevel 1 goto :fatal
call :check_required gh GitHub.cli "GitHub CLI"
if errorlevel 1 goto :fatal

where node >nul 2>&1
if not errorlevel 1 (
  where npm >nul 2>&1
  if not errorlevel 1 set "NODE_OK=1"
)

if "!NODE_OK!"=="1" (
  echo.
  echo [CHECK] Optional local validation
  call npm ci
  if errorlevel 1 (
    echo [WARN] npm ci failed. Deployment will continue; GitHub Actions will build again.
  ) else (
    call npm run check
    if errorlevel 1 (
      echo [WARN] Local check failed. Deployment will continue so the Actions log can show details.
    ) else (
      echo [OK] Local validation passed.
    )
  )
) else (
  echo.
  echo [WARN] Node.js/npm not found. Skipping local validation.
  echo [INFO] GitHub Actions will install Node.js and build the site remotely.
)

echo.
echo [CHECK] GitHub authentication
gh auth status >nul 2>&1
if errorlevel 1 (
  echo [INFO] Starting GitHub browser login...
  gh auth login --web --git-protocol https
  if errorlevel 1 (
    echo [ERROR] GitHub login failed.
    echo [FIX] Run manually: gh auth login
    goto :fatal
  )
)
gh auth setup-git >nul 2>&1

set "GH_OWNER="
for /f "usebackq delims=" %%U in (`gh api user --jq .login 2^>nul`) do set "GH_OWNER=%%U"
if not defined GH_OWNER (
  echo [ERROR] Could not determine GitHub username.
  echo [FIX] Run: gh api user --jq .login
  goto :fatal
)

set "FULL_REPO=!GH_OWNER!/%REPO_NAME%"
set "REPO_URL=https://github.com/!FULL_REPO!"
set "REMOTE_URL=https://github.com/!FULL_REPO!.git"
set "PAGES_URL=https://!GH_OWNER!.github.io/%REPO_NAME%/"
if /i "%REPO_NAME%"=="!GH_OWNER!.github.io" set "PAGES_URL=https://!GH_OWNER!.github.io/"
set "ACTIONS_URL=!REPO_URL!/actions/workflows/deploy.yml"
set "SETTINGS_URL=!REPO_URL!/settings"
echo [OK] GitHub user: !GH_OWNER!
echo [OK] Repository : !FULL_REPO!
echo [OK] Pages URL  : !PAGES_URL!

echo.
echo [CHECK] Local Git repository
if not exist ".git" (
  git init
  if errorlevel 1 goto :git_error
  echo [OK] git init
) else (
  echo [OK] Existing .git directory
)
git branch -M "%DEFAULT_BRANCH%" >nul 2>&1

set "GIT_USER_NAME="
for /f "delims=" %%N in ('git config user.name 2^>nul') do set "GIT_USER_NAME=%%N"
if not defined GIT_USER_NAME (
  git config user.name "!GH_OWNER!"
  echo [WARN] Git user.name set locally to !GH_OWNER!
)
set "GIT_USER_EMAIL="
for /f "delims=" %%E in ('git config user.email 2^>nul') do set "GIT_USER_EMAIL=%%E"
if not defined GIT_USER_EMAIL (
  git config user.email "!GH_OWNER!@users.noreply.github.com"
  echo [WARN] Git user.email set locally to GitHub noreply address.
)

echo.
echo [CHECK] GitHub repository: !FULL_REPO!
gh repo view "!FULL_REPO!" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Repository does not exist yet. Creating it now...
  if /i "%REPO_VISIBILITY%"=="private" (
    set "VIS_FLAG=--private"
  ) else if /i "%REPO_VISIBILITY%"=="internal" (
    set "VIS_FLAG=--internal"
  ) else (
    set "VIS_FLAG=--public"
  )
  gh repo create "!FULL_REPO!" !VIS_FLAG! --description "%REPO_DESCRIPTION%"
  if errorlevel 1 (
    echo [ERROR] Repository creation failed.
    echo [FIX] Try manually: gh repo create "!FULL_REPO!" --public --description "%REPO_DESCRIPTION%"
    goto :fatal
  )
  echo [OK] Repository created.
) else (
  echo [OK] Existing GitHub repository will be used.
)

echo.
echo [CHECK] origin remote
set "CURRENT_ORIGIN="
for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "CURRENT_ORIGIN=%%R"
if not defined CURRENT_ORIGIN (
  git remote add origin "!REMOTE_URL!"
  if errorlevel 1 goto :git_error
  echo [OK] origin added.
) else (
  if /i not "!CURRENT_ORIGIN!"=="!REMOTE_URL!" (
    echo [WARN] Replacing existing origin:
    echo        old: !CURRENT_ORIGIN!
    echo        new: !REMOTE_URL!
    git remote set-url origin "!REMOTE_URL!"
    if errorlevel 1 goto :git_error
  ) else (
    echo [OK] origin is correct.
  )
)

echo.
echo [CHECK] Synchronize existing remote branch
set "REMOTE_MAIN_EXISTS=0"
git ls-remote --exit-code --heads origin "refs/heads/%DEFAULT_BRANCH%" >nul 2>&1
if not errorlevel 1 set "REMOTE_MAIN_EXISTS=1"

if "!REMOTE_MAIN_EXISTS!"=="1" (
  echo [INFO] Remote %DEFAULT_BRANCH% exists. Fetching before update.
  git fetch origin "%DEFAULT_BRANCH%" --prune
  if errorlevel 1 (
    echo [ERROR] Could not fetch origin/%DEFAULT_BRANCH%.
    goto :fatal
  )

  git rev-parse --verify HEAD >nul 2>&1
  if errorlevel 1 (
    echo [INFO] Local repository has no commit yet. Using remote branch as base.
    git reset --mixed "origin/%DEFAULT_BRANCH%"
    if errorlevel 1 goto :git_error
  ) else (
    git merge-base HEAD "origin/%DEFAULT_BRANCH%" >nul 2>&1
    if errorlevel 1 (
      echo [WARN] Local and remote histories are unrelated.
      git branch "bootstrap-local-backup" HEAD >nul 2>&1
      git reset --mixed "origin/%DEFAULT_BRANCH%"
      if errorlevel 1 goto :git_error
    ) else (
      git merge-base --is-ancestor "origin/%DEFAULT_BRANCH%" HEAD >nul 2>&1
      if errorlevel 1 (
        echo [INFO] Remote has commits not present in this extracted folder.
        git branch "bootstrap-local-backup" HEAD >nul 2>&1
        git reset --mixed "origin/%DEFAULT_BRANCH%"
        if errorlevel 1 goto :git_error
      ) else (
        echo [OK] Local history already contains origin/%DEFAULT_BRANCH%.
      )
    )
  )
  git branch -M "%DEFAULT_BRANCH%" >nul 2>&1
) else (
  echo [OK] Remote %DEFAULT_BRANCH% does not exist yet. Initial push will be used.
)

echo.
echo [CHECK] Commit
git add -A
if errorlevel 1 goto :git_error
git diff --cached --quiet
if errorlevel 1 (
  git rev-parse --verify HEAD >nul 2>&1
  if errorlevel 1 (
    git commit -m "%INITIAL_COMMIT%"
  ) else (
    git commit -m "%UPDATE_COMMIT%"
  )
  if errorlevel 1 goto :git_error
  echo [OK] Commit created.
) else (
  echo [OK] No new changes to commit.
)

echo.
echo [CHECK] Push main branch
git push -u origin "%DEFAULT_BRANCH%"
if errorlevel 1 (
  echo [ERROR] Push failed.
  echo [FIX] Check: git status
  echo [FIX] Check: git remote -v
  echo [FIX] Check: gh auth status
  goto :fatal
)
echo [OK] Source uploaded to GitHub.

echo.
echo [CHECK] Repository metadata
gh repo edit "!FULL_REPO!" --description "%REPO_DESCRIPTION%" --homepage "!PAGES_URL!" --default-branch "%DEFAULT_BRANCH%" --enable-issues --enable-wiki=false --enable-projects=false >nul 2>&1
for %%T in (%REPO_TOPICS:,= %) do gh repo edit "!FULL_REPO!" --add-topic "%%T" >nul 2>&1

echo.
echo [CHECK] GitHub Pages = GitHub Actions
gh api -H "Accept: application/vnd.github+json" "repos/!FULL_REPO!/pages" >nul 2>&1
if errorlevel 1 (
  gh api --method POST -H "Accept: application/vnd.github+json" "repos/!FULL_REPO!/pages" -f build_type=workflow >nul 2>&1
  if errorlevel 1 (
    echo [WARN] Automatic Pages enablement did not complete.
    echo [INFO] The deploy workflow may still configure Pages on first run.
    echo [FIX] If needed, open: !SETTINGS_URL!/pages
  ) else (
    echo [OK] GitHub Pages enabled.
  )
) else (
  gh api --method PUT -H "Accept: application/vnd.github+json" "repos/!FULL_REPO!/pages" -f build_type=workflow >nul 2>&1
  echo [OK] GitHub Pages already exists.
)

echo.
echo [CHECK] Deploy workflow
set "WORKFLOW_READY=0"
for /L %%I in (1,1,12) do (
  if "!WORKFLOW_READY!"=="0" (
    gh workflow view deploy.yml -R "!FULL_REPO!" >nul 2>&1
    if not errorlevel 1 set "WORKFLOW_READY=1"
    if "!WORKFLOW_READY!"=="0" timeout /t 2 /nobreak >nul
  )
)

if "!WORKFLOW_READY!"=="1" (
  gh workflow enable deploy.yml -R "!FULL_REPO!" >nul 2>&1
  gh workflow run deploy.yml --ref "%DEFAULT_BRANCH%" -R "!FULL_REPO!" >nul 2>&1
  set "RUN_ID="
  for /L %%W in (1,1,15) do (
    if not defined RUN_ID (
      timeout /t 2 /nobreak >nul
      for /f "usebackq delims=" %%I in (`gh run list -R "!FULL_REPO!" --workflow deploy.yml --branch "%DEFAULT_BRANCH%" --limit 1 --json databaseId --jq ".[0].databaseId" 2^>nul`) do set "RUN_ID=%%I"
    )
  )
  if defined RUN_ID (
    echo [CHECK] Watching Actions run !RUN_ID!
    gh run watch !RUN_ID! -R "!FULL_REPO!" --compact --exit-status
    if errorlevel 1 (
      echo [WARN] GitHub Actions deployment failed.
      echo [FIX] Open: !ACTIONS_URL!
      echo [INFO] Source upload is complete even though deployment needs review.
    ) else (
      set "DEPLOY_OK=1"
      echo [OK] GitHub Pages deployment succeeded.
    )
  ) else (
    echo [WARN] Could not identify the Actions run yet.
    echo [INFO] Check: !ACTIONS_URL!
  )
) else (
  echo [WARN] deploy.yml is not visible on GitHub yet.
  echo [INFO] Check: !ACTIONS_URL!
)

if "!DEPLOY_OK!"=="1" (
  echo.
  echo [CHECK] Tag / Release
  git ls-remote --exit-code --tags origin "refs/tags/%INITIAL_TAG%" >nul 2>&1
  if errorlevel 1 (
    git tag -a "%INITIAL_TAG%" -m "AirFlow Select %INITIAL_TAG%" >nul 2>&1
    if not errorlevel 1 git push origin "%INITIAL_TAG%" >nul 2>&1
  )
  gh release view "%INITIAL_TAG%" -R "!FULL_REPO!" >nul 2>&1
  if errorlevel 1 gh release create "%INITIAL_TAG%" -R "!FULL_REPO!" --title "%INITIAL_TAG% - AirFlow Select" --notes "Initial GitHub Pages release." --verify-tag >nul 2>&1
)

echo.
echo ============================================================
echo [OK] Bootstrap finished
echo Repository : !REPO_URL!
echo Pages      : !PAGES_URL!
echo Actions    : !ACTIONS_URL!
echo ============================================================
echo.
if "%OPEN_AFTER_DEPLOY%"=="1" (
  start "" "!REPO_URL!"
  if "!DEPLOY_OK!"=="1" start "" "!PAGES_URL!"
)
exit /b 0

:check_required
set "TOOL=%~1"
set "WINGET_ID=%~2"
set "DISPLAY=%~3"
echo [CHECK] %DISPLAY%
where %TOOL% >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%V in ('%TOOL% --version 2^>nul') do (
    echo [OK] %%V
    goto :eof
  )
  echo [OK] %DISPLAY% installed.
  goto :eof
)
echo [WARN] %DISPLAY% not found.
where winget >nul 2>&1
if errorlevel 1 (
  echo [ERROR] winget is unavailable. Install %DISPLAY% manually and rerun.
  exit /b 1
)
echo [CHECK] Installing %DISPLAY% using winget...
winget install --id %WINGET_ID% -e --source winget --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo [ERROR] Automatic installation failed.
  exit /b 1
)
echo [WARN] Installation completed. Close this window and run it again so PATH refreshes.
exit /b 1

:git_error
echo [ERROR] Git command failed.
echo [FIX] Check: git status
echo [FIX] Check: git remote -v
goto :fatal

:fatal
echo.
echo ============================================================
echo [ERROR] Bootstrap did not complete.
echo Fix the error above and rerun run-github-bootstrap.cmd.
echo ============================================================
exit /b 1
