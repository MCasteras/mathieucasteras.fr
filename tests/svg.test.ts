/** Filtre SVG : ce qui passe, ce qui est écarté. */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { svgSur } from '../src/lib/svg';

const ok = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/><text x="1" y="8">a</text></svg>';

describe('svgSur', () => {
  it('accepte un SVG propre, y compris le jeu d’exemple', async () => {
    expect(svgSur(ok)).toBe(true);
    const posts = JSON.parse(await readFile('fixtures/vitrine/posts.json', 'utf8')) as Array<{ image?: { svg: string } }>;
    expect(svgSur(posts[0].image!.svg)).toBe(true);
  });

  it.each([
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['gestionnaire', '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)"/></svg>'],
    ['lien externe', '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://x.test"><rect/></a></svg>'],
    ['image externe', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://x.test/a.png"/></svg>'],
    ['use externe', '<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="https://x.test/a.svg#b"/></svg>'],
    ['javascript:', '<svg xmlns="http://www.w3.org/2000/svg"><rect style="x:javascript:alert(1)"/></svg>'],
    ['url externe dans un style', '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:url(https://x.test/a)}</style></svg>'],
    ['foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>'],
    ['pas un svg', '<div>x</div>'],
    ['vide', ''],
  ])('écarte : %s', (_, svg) => {
    expect(svgSur(svg)).toBe(false);
  });
});

describe('urlWeb', () => {
  it('ne garde que http(s)', async () => {
    const { urlWeb } = await import('../src/lib/format');
    expect(urlWeb(' https://a.fr/x ')).toBe('https://a.fr/x');
    for (const u of ['javascript:alert(1)', 'data:text/html,x', '//a.fr', '/x', '', null, undefined]) expect(urlWeb(u)).toBeUndefined();
  });
});
