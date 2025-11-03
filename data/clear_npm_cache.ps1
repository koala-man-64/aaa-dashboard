# 1) Stop any dev servers first
# 2) Clear tool caches (Babel/ESLint/Webpack, etc.)
Remove-Item -Recurse -Force .\node_modules\.cache -ErrorAction SilentlyContinue
Remove-Item -Force .\.eslintcache -ErrorAction SilentlyContinue  # if present

# (Optional) start clean
Remove-Item -Recurse -Force .\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\coverage -ErrorAction SilentlyContinue

# 3) If you want to fully clean install:
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force .\package-lock.json -ErrorAction SilentlyContinue

# 4) Clear npm’s cache
npm cache clean --force

# 5) Reinstall deps and build
npm install   # or: npm ci
npm run build
