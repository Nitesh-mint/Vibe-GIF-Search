#!/bin/bash

# Clean old builds
rm -rf dist/chrome dist/firefox

# Chrome
mkdir -p dist/chrome
cp -r src/* dist/chrome/
cp manifest.chrome.json dist/chrome/manifest.json

# Firefox
mkdir -p dist/firefox
cp -r src/* dist/firefox/
cp manifest.firefox.json dist/firefox/manifest.json

echo "Done! Load dist/chrome in Chrome, dist/firefox in Firefox."