import { describe, expect, it } from 'vitest';
import { parseRoute } from './routes';

describe('parseRoute', () => {
  it('riconosce home e area personale', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' });
    expect(parseRoute('/app')).toEqual({ kind: 'app' });
  });

  it('riconosce profili e piante pubbliche', () => {
    expect(parseRoute('/gernotfound/public')).toEqual({ kind: 'profile', username: 'gernotfound' });
    expect(parseRoute('/gernotfound/public/avocado-bacon')).toEqual({
      kind: 'plant', username: 'gernotfound', slug: 'avocado-bacon'
    });
  });

  it('rifiuta username riservati e slug invalidi', () => {
    expect(parseRoute('/admin/public')).toEqual({ kind: 'not-found' });
    expect(parseRoute('/guest/public/bad_slug')).toEqual({ kind: 'not-found' });
    expect(parseRoute('/GUEST/public')).toEqual({ kind: 'not-found' });
  });

  it('rifiuta slash codificati, stringhe malformate e percorsi extra', () => {
    expect(parseRoute('/guest%2fadmin/public')).toEqual({ kind: 'not-found' });
    expect(parseRoute('/%E0%A4%A/public')).toEqual({ kind: 'not-found' });
    expect(parseRoute('/guest/public/plant/extra')).toEqual({ kind: 'not-found' });
    expect(parseRoute('//guest/public')).toEqual({ kind: 'not-found' });
  });
});
