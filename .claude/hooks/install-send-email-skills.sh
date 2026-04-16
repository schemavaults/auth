#!/bin/bash
if [ ! -d "./.claude" ]; then
    echo "Missing .claude directory"
    exit 1
fi


if [ ! -d ".claude/skills" ]; then
    cd ./.claude
    mkdir skills
    cd ..
fi

if [ ! -d "node_modules" ]; then
  echo "Install dependencies before attempting to install skills..."
  exit 1
fi

bunx skills add schemavaults/send-email \
    --skill send-email-to-mailing-list \
    --skill list-email-templates \
    --yes \
    --agent claude-code
