export function run(text, options = {}) {
  const textRun = { content: text.endsWith('\n') ? text : `${text}\n` };
  const textStyle = {};
  if (options.bold) textStyle.bold = true;
  if (options.italic) textStyle.italic = true;
  if (options.href) textStyle.link = { url: options.href };
  if (Object.keys(textStyle).length) textRun.textStyle = textStyle;
  return { textRun };
}

export function paragraph(content, options = {}) {
  const paragraph = { elements: Array.isArray(content) ? content : [run(content, options)] };
  if (options.style) paragraph.paragraphStyle = { namedStyleType: options.style };
  if (options.bullet) paragraph.bullet = options.bullet;
  if (options.inlineObjectId) paragraph.elements.unshift({ inlineObjectElement: { inlineObjectId: options.inlineObjectId } });
  return { paragraph };
}

export function table(rows) {
  return {
    table: {
      tableRows: rows.map(row => ({
        tableCells: row.map(cell => ({ content: [paragraph(cell)] }))
      }))
    }
  };
}

export function articleDoc({ blocks, lists = {}, inlineObjects = {}, title = 'Fixture' }) {
  return { title, body: { content: blocks }, lists, inlineObjects };
}

export function sampleBlocks() {
  const bullet = { listId: 'takeaways', nestingLevel: 0 };
  const steps = { listId: 'steps', nestingLevel: 0 };
  return [
    { sectionBreak: {} },
    paragraph('Note: This article is an update to the current version:', { style: 'HEADING_2' }),
    paragraph('https://www.academy.com/expert-advice/basketball/how-to-choose-a-basketball-hoop?utm=test'),
    paragraph(''),
    paragraph('Related Articles'),
    paragraph('https://www.academy.com/expert-advice/basketball-equipment-list', { bullet }),
    paragraph('https://www.academy.com/expert-advice/basketball/how-to-choose-the-best-basketball-shoes', { bullet }),
    paragraph('Meta Data *'),
    paragraph('Asset Folder: https://app.contentstack.com/#!/stack/blt964243cdd7810dea/assets/blta5172dec2dcd9599/browse'),
    paragraph('Article Type: Buying Guide'),
    paragraph('Category: Basketball'),
    paragraph('Title Tag: How to Choose a Basketball Hoop | Academy Sports + Outdoors *'),
    paragraph('Meta Description: Find the perfect basketball hoop for your family.'),
    paragraph('Keywords: basketball, hoop'),
    paragraph('How to Choose a Basketball Hoop', { style: 'HEADING_1' }),
    paragraph([run('Start with '), run('the right hoop', { bold: true }), run('.')]),
    paragraph('Read the guide.', { href: 'https://www.academy.com/c/sports/basketball' }),
    paragraph('<script>alert(1)</script>'),
    paragraph('Bad link', { href: 'javascript:alert(1)' }),
    paragraph('Key Takeaways', { style: 'HEADING_2' }),
    paragraph('Which is better, tempered glass? Tempered glass plays like the pros.', { bullet }),
    paragraph('Fill the base with sand.', { bullet }),
    paragraph('Tempered Glass', { style: 'HEADING_2' }),
    paragraph('Tempered glass is the pro standard.'),
    paragraph('[Graphic: A family playing in the driveway.]'),
    paragraph('[Graphic: A hoop at sunset Hoop_image_2-desktop.png]'),
    table([
      ['', '', ''],
      ['Feature', 'Tempered Glass', 'Acrylic'],
      ['Rebound', 'Best', 'Good']
    ]),
    paragraph('Check the base.', { bullet: steps }),
    paragraph('Frequently Asked Questions', { style: 'HEADING_2' }),
    paragraph('How much space do I need? A two-car driveway is enough.'),
    paragraph('Have Fun on the Court', { style: 'HEADING_2' }),
    paragraph('Academy has a hoop for every driveway.')
  ];
}

export function sampleLists() {
  return {
    takeaways: { listProperties: { nestingLevels: [{ glyphType: 'BULLET' }] } },
    steps: { listProperties: { nestingLevels: [{ glyphType: 'DECIMAL' }] } }
  };
}

export function sampleDoc() {
  return articleDoc({ blocks: sampleBlocks(), lists: sampleLists() });
}
