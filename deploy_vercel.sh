#!/bin/bash

if ! command -v vercel &> /dev/null
then
    echo "Error: vercel is not installed" >&2
    exit 1
fi

 # parse VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID from .env
 if [ -f .env ]; then
     export $(grep -E '^(VERCEL_TOKEN|VERCEL_ORG_ID|VERCEL_PROJECT_ID)=' .env | xargs)
 else
     echo "Error: .env file not found to extract Vercel credentials from" >&2
     exit 1
 fi

 # Check if required Vercel credentials are set
  if [ -z "$VERCEL_TOKEN" ] || [ -z "$VERCEL_ORG_ID" ] || [ -z "$VERCEL_PROJECT_ID" ]; then
      echo "Error: VERCEL_TOKEN, VERCEL_ORG_ID, and VERCEL_PROJECT_ID must all be set" >&2
      exit 1
  fi

VERCEL_ORG_ID=$VERCEL_ORG_ID VERCEL_PROJECT_ID=$VERCEL_PROJECT_ID vercel pull --yes --environment=production --token=$VERCEL_TOKEN

VERCEL_ORG_ID=$VERCEL_ORG_ID VERCEL_PROJECT_ID=$VERCEL_PROJECT_ID vercel build --prod --token=$VERCEL_TOKEN

VERCEL_ORG_ID=$VERCEL_ORG_ID VERCEL_PROJECT_ID=$VERCEL_PROJECT_ID vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
