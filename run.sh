#!/bin/bash

echo "Running livescore.js..."
node livescore.js
if [ $? -ne 0 ]; then
  echo "livescore.js failed. Exiting."
  exit 1
fi

echo "Running analyzer.js..."
node analyzer.js
if [ $? -ne 0 ]; then
  echo "analyzer.js failed. Exiting."
  exit 1
fi

echo "All scripts executed successfully."
