// START_MODULE_CONTRACT
//   PURPOSE: Root application entry point configuring React Router and wrapping routes in AppLayout.
//   SCOPE: Routing and auth guarding at the application root.
//   DEPENDS: M-LAYOUT, M-TEMPLATES, M-SUBMIT, M-TIPS, M-AUTH, M-AUTH-UI
//   LINKS: none
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   App - Root React component containing the router
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.6.0 - Default redirects updated from /templates to /submit]
//   PREVIOUS_CHANGE: [v3.5.0 - Initial GRACE contract added]
// END_CHANGE_SUMMARY

import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/modules/layout';
import TemplatesContainer from '@/modules/templates';
import { SubmitForm } from '@/modules/submit';
import { TipsPage } from '@/modules/tips';
import { useAuth } from '@/modules/auth/useAuth';
import { AuthPage } from '@/modules/auth-ui';

// Routes wrapped in AppLayout — sidebar is always visible
export function App() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/submit" replace />} />
        <Route path="/index.html" element={<Navigate to="/submit" replace />} />
        <Route path="/templates" element={<TemplatesContainer />} />
        <Route path="/submit" element={<SubmitForm />} />
        <Route path="/tips" element={<TipsPage />} />
        <Route path="*" element={<Navigate to="/submit" replace />} />
      </Route>
    </Routes>
  );
}
