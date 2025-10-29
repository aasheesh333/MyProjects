#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Update and install system dependencies
sudo apt-get update
sudo apt-get install -y ffmpeg python3-pip

# Install Python packages
pip3 install yt-dlp gallery-dl

# Install Node.js dependencies
npm install
