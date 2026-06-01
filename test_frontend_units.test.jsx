'use strict';

/**
 * Frontend unit tests (React Testing Library) for required frontend units from attached instructions.
 *
 * IMPORTANT:
 * - This repository currently contains no frontend source implementation (no React app, no package.json).
 * - These tests are scaffolded and will fail fast until React + RTL dependencies and components exist.
 *
 * Once frontend code exists:
 * - Ensure Jest is configured for jsdom + JSX transform.
 * - Update module paths in requireOrFail(...) to real component/util locations.
 */

function requireOrFail(modulePath, hint) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(modulePath);
  } catch (err) {
    const msg =
      `Missing frontend implementation module: ${modulePath}\n` +
      (hint ? `Hint: ${hint}\n` : '') +
      `Original error: ${String(err && err.message ? err.message : err)}`;
    throw new Error(msg);
  }
}

describe('Frontend unit tests (scaffold) — per attached requirements', () => {
  test('TC-FE-LOGIN-001: Login form validation blocks empty submit', async () => {
    const React = requireOrFail('react', 'Install react/react-dom and configure jest for frontend tests.');
    const { render, screen } = requireOrFail('@testing-library/react', 'Install @testing-library/react.');
    const userEvent = requireOrFail('@testing-library/user-event', 'Install @testing-library/user-event.');
    const { LoginForm } = requireOrFail(
      './src/frontend/components/LoginForm',
      'Implement and export LoginForm component'
    );

    const onSubmit = jest.fn();

    render(React.createElement(LoginForm, { onSubmit }));
    await userEvent.click(screen.getByRole('button', { name: /log in|sign in/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/required|username|password/i, { exact: false })
    ).toBeInTheDocument();
  });

  test('TC-FE-LOGIN-002: Login form calls submit with valid credentials', async () => {
    const React = requireOrFail('react');
    const { render, screen } = requireOrFail('@testing-library/react');
    const userEvent = requireOrFail('@testing-library/user-event');
    const { LoginForm } = requireOrFail('./src/frontend/components/LoginForm');

    const onSubmit = jest.fn();
    render(React.createElement(LoginForm, { onSubmit }));

    await userEvent.type(screen.getByLabelText(/username|email/i), 'dispatcher@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /log in|sign in/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'dispatcher@example.com',
        password: 'Password123!',
      })
    );
  });

  test('TC-FE-OUTFORM-001: Outage form field validation', async () => {
    const React = requireOrFail('react');
    const { render, screen } = requireOrFail('@testing-library/react');
    const userEvent = requireOrFail('@testing-library/user-event');
    const { OutageForm } = requireOrFail(
      './src/frontend/components/OutageForm',
      'Implement and export OutageForm component'
    );

    const onSubmit = jest.fn();
    render(React.createElement(OutageForm, { onSubmit }));

    await userEvent.click(screen.getByRole('button', { name: /create outage|submit/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/title.*required|postcode.*required|priority.*required/i)).toBeInTheDocument();
  });

  test('TC-FE-MAP-001: Severity colour mapping (marker colours)', () => {
    const { getSeverityColor } = requireOrFail(
      './src/frontend/utils/severity',
      'Implement and export getSeverityColor(severity)'
    );

    expect(getSeverityColor('LOW')).toBeTruthy();
    expect(getSeverityColor('MEDIUM')).toBeTruthy();
    expect(getSeverityColor('HIGH')).toBeTruthy();

    // Should be stable and distinct.
    expect(getSeverityColor('LOW')).not.toEqual(getSeverityColor('HIGH'));
  });

  test('TC-FE-BADGE-001: Status badge rendering by severity', () => {
    const React = requireOrFail('react');
    const { render, screen } = requireOrFail('@testing-library/react');
    const { StatusBadge } = requireOrFail(
      './src/frontend/components/StatusBadge',
      'Implement and export StatusBadge component'
    );

    render(React.createElement(StatusBadge, { severity: 'HIGH', status: 'ACTIVE' }));

    expect(screen.getByText(/active/i)).toBeInTheDocument();
    // Prefer class-based assertion to avoid coupling to CSS implementation.
    const el = screen.getByText(/active/i);
    expect(el.className).toMatch(/high|critical|severity/i);
  });

  test('TC-FE-JOB-001: Job card data display', () => {
    const React = requireOrFail('react');
    const { render, screen } = requireOrFail('@testing-library/react');
    const { JobCard } = requireOrFail('./src/frontend/components/JobCard', 'Implement and export JobCard component');

    const job = {
      id: 'j-1',
      crewName: 'Crew A',
      location: '2000',
      status: 'EN_ROUTE',
      etaMinutes: 15,
    };

    render(React.createElement(JobCard, { job }));

    expect(screen.getByText(/crew a/i)).toBeInTheDocument();
    expect(screen.getByText(/en_route|en route/i)).toBeInTheDocument();
    expect(screen.getByText(/15/i)).toBeInTheDocument();
  });

  test('TC-FE-LIST-001: Empty state rendering (no outages)', () => {
    const React = requireOrFail('react');
    const { render, screen } = requireOrFail('@testing-library/react');
    const { OutageList } = requireOrFail(
      './src/frontend/components/OutageList',
      'Implement and export OutageList component'
    );

    render(React.createElement(OutageList, { outages: [] }));

    expect(screen.getByText(/no outages|nothing to show|all clear/i)).toBeInTheDocument();
  });

  test('TC-FE-LIST-002: Error state rendering (API failure)', () => {
    const React = requireOrFail('react');
    const { render, screen } = requireOrFail('@testing-library/react');
    const { OutagesPage } = requireOrFail(
      './src/frontend/pages/OutagesPage',
      'Implement and export OutagesPage component that handles API error state'
    );

    // Provide a minimal API client mock via props (preferred) to keep test unit-scoped.
    const api = { listOutages: jest.fn().mockRejectedValue(new Error('API failure')) };

    render(React.createElement(OutagesPage, { api }));

    expect(screen.getByText(/error|failed|unable to load/i)).toBeInTheDocument();
  });
});
