#!/bin/sh

echo "Deploying commands to Discord..."
dotenvx run -- node dist/deploy-commands.js

echo "Starting bot..."
dotenvx run -- npm start