# inkdrop-link-compact

![movie1](https://raw.githubusercontent.com/basyura/inkdrop-link-compact/master/images/movie1.gif)

`inkdrop-link-compact` is an Inkdrop plugin for Inkdrop that automatically compacts the URL part of Markdown links when you open a note. You can toggle the compact view in the active editor with a `link-compact:toggle` command.

* https://my.inkdrop.app/plugins/link-compact
* https://github.com/basyura/inkdrop-link-compact

## Features

- Replaces the URL part of Markdown links with a single character, such as an emoji
- Lets you customize the replacement character in Inkdrop plugin settings

## Screenshots

![Screenshot 1](https://raw.githubusercontent.com/basyura/inkdrop-link-compact/master/images/img1.png)

![Screenshot 2](https://raw.githubusercontent.com/basyura/inkdrop-link-compact/master/images/img2.png)

## Requirements

- Inkdrop v6 or later

## Installation

Install `link-compact` from Inkdrop's plugin manager.

## Commands

- `link-compact:toggle`
  - Toggles compact display for Markdown link URLs in the active editor


## Configuration

- `link-compact.linkEmoji`
  - Character shown in place of the hidden URL
  - Default: `🌐`
- `link-compact.notelinkEmoji`
  - Character shown in place of hidden `inkdrop://` note link URLs
  - Default: `📓`
- `link-compact.imglinkEmoji`
  - Character shown in place of hidden image link URLs
  - Default: `🖼️`

## Styling compact links

When compact display is enabled, the plugin adds the `link-compact-enabled` class to the editor.
The following sample makes Markdown link syntax less visually prominent while compact display is enabled.
Add it to your Inkdrop `Styles.css`:

```css
.link-compact-enabled .md-link-mark {
  color: rgba(119, 204, 189, 0.3);
  color: black !important;
  font-size: 5pt;
  margin-left: -2px;
}
```

or

```css
.link-compact-enabled .md-link-mark {
  display: none;
}
```

When compact display is disabled, the class is removed and the rule no longer applies.

## Rendered HTML

When compact display is enabled, the URL part of a Markdown link is replaced with a non-editable `span`.
The original URL is stored in the `data-url` attribute.

For example, `https://www.inkdrop.app` is rendered as:

```html
<span class="link-compact-mark" contenteditable="false"
      data-url="https://www.inkdrop.app">🌐</span>
```

## Attribution

This project is a maintained and republished fork of `shagon94/short-link`, originally released under the MIT license and updated for Inkdrop v6.

## Changelog

* https://github.com/basyura/inkdrop-link-compact/commits/master/
