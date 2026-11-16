# Authoring an Expert Advice Google Doc

Put the metadata block before the Heading 1. The importer reads these labels from the document. The GitHub Action does not ask for them again.

```text
Note: This article is an update to the current version:
https://www.academy.com/expert-advice/basketball/how-to-choose-a-basketball-hoop

URL: /expert-advice/basketball/how-to-choose-a-basketball-hoop
Asset Folder: https://app.contentstack.com/#!/stack/blt964243cdd7810dea/assets/FOLDER_UID/browse
Article Type: Buying Guide
Category: Basketball
Author: Academy Staff
Author URL: https://www.academy.com/expert-advice/board-of-experts
Keywords: basketball, hoop
Page Name: How to Choose a Basketball Hoop | Academy
Minute Reads: 8

Related Articles
* https://www.academy.com/expert-advice/basketball-equipment-list
* https://www.academy.com/expert-advice/basketball/how-to-choose-the-best-basketball-shoes

Meta Data
Title Tag: How to Choose a Basketball Hoop | Academy Sports + Outdoors
Meta Description: Find the perfect basketball hoop for your family.
```

`Note: This article is an update to the current version:` followed by the live URL is enough for `URL:`. Use a `URL:` line for a new article. Repeat `Category:` once per category. The first category is primary.

`Article Type` must be one of: Buying Guide, How To, Checklist, Explore, Video, Outdoors. `Category` must match an Expert Advice category title. `Asset Folder` is the Contentstack folder UID, or the folder URL, where design has already uploaded the images, GIFs, and videos.

The Heading 1 is the article title. It becomes the Contentstack entry title and is not repeated in the body.

Use Heading 2 and Heading 3 for sections. A Heading 2 named `Key Takeaways` becomes the blue takeaway box. Write each takeaway as a bullet. A bullet shaped like `Question? Answer` links to a later heading when the question matches that heading.

`Frequently Asked Questions` is a Heading 2. Each answer can be its own paragraph shaped like `Question? Answer`.

Comparison tables use a header row. A blank first row is ignored. Bullets become a list, and a numbered list stays numbered. Bold, italic, and http(s) links are kept.

Images are not uploaded by this importer. Mark each one in reading order:

```text
[Graphic: A family playing in the driveway.]
[Graphic: A hoop at sunset Hoop_image_2-desktop.png]
```

A `[Graphic: ...]` note or an inline image is slot 1, then slot 2, and so on. Slot N uses the folder files whose names contain `image_N` or `image-N`, with `-desktop` and `-mobile` chosen for the two breakpoints. A filename written in the graphic note wins when that file is in the folder. One file is used for both breakpoints when the other size is absent. A video file is rendered as video. A file whose name contains `thumbnail` becomes the card image and is not placed in the body.

Share the Doc with the Google service account before running the Action.
