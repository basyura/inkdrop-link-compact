# inkdrop-link-compact

`inkdrop-link-compact` is an Inkdrop plugin that automatically compacts the URL portion of Markdown links when a note is opened. You can toggle the compact display in the active editor with a command.

## Features

- Replaces the URL portion of Markdown links with a single character such as an emoji
- Lets you change the replacement character from Inkdrop plugin settings

## Installation

Install `link-compact` from Inkdrop's plugin manager.

## Commands

- `link-compact:toggle`
  - Toggles compact display for Markdown link URLs in the active editor


## Configuration

- `link-compact.linkEmoji`
  - Character shown in place of the hidden URL
  - Default: `🔗`

## Attribution

This project is a maintained and republished fork of `shagon94/short-link`, which was originally released under the MIT license, with adjustments for Inkdrop v6.

