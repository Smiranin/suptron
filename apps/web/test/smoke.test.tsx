import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFakeHome } from './fake-server';
import { renderApp } from './render';

describe('app shell', () => {
  it('renders the navigation and redirects / to /projects', async () => {
    const home = useFakeHome();
    const { router } = renderApp('/', home.live);
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects');
    expect(screen.getByRole('link', { name: 'Hangar' })).toBeInTheDocument();
  });
});
