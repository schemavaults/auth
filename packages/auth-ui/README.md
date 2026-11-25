# @schemavaults/auth-ui

## About

UI components for interacting with the [SchemaVaults Auth Platform](https://auth.schemavaults.com).

## Install dependencies

Use the [Bun](https://bun.sh) package manager:
```bash
bun install
```

## `@schemavaults/ui` version

`@schemavaults/ui` is a peer dependency with a wide range (`>=0.119.0 <1.0.0`), so an
app can upgrade `@schemavaults/ui` without waiting for a new `@schemavaults/auth-ui`.
The pinned `devDependencies` entry is only the version this package is built and
tested against in the monorepo: when upgrading `@schemavaults/ui`, bump that entry and
leave the peer range alone. Raise the range's lower bound only when this package
starts using something a newer `@schemavaults/ui` added.

## Build package
```bash
bun run build
```

## Usage

### TailwindCSS Set-up

This package uses the [@schemavaults/ui](https://github.com/schemavaults/ui) and [@schemavaults/theme](https://github.com/schemavaults/theme) packages to render TailwindCSS-styled React.js components. Ensure that you are using `@schemavaults/theme` to build an appropriate Tailwind config that loads the TailwindCSS `className`'s used in this `@schemavaults/auth-ui` package.

## GitHub Repository

This package's source code is hosted on GitHub: [https://github.com/schemavaults/auth-ui](https://github.com/schemavaults/auth-ui)
