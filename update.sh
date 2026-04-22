#!/bin/sh

# Backup Scripts
zip -r bckup.scripts.zip scripts
# remove repository changes
rm -rf scripts/ 
git stash
# fetch repository data
git pull 
# Restore Backup
rm -rf scripts/ 
unzip bckup.scripts.zip
rm bckup.scripts.zip
# Instal modules if there is
bun install 
