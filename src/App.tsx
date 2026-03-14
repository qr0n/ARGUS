import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Alerts } from './pages/Alerts';
import { FindMatches } from './pages/FindMatches';
import { LiveCamera } from './pages/LiveCamera';
import { ActivityLog } from './pages/ActivityLog';
import { CaseProfiles } from './pages/CaseProfiles';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { useState } from 'react';

function App() {
  const [showOnboarding, setShowOnboarding] = useState(true);

  return (
    <BrowserRouter>
      {showOnboarding && <OnboardingOverlay onDismiss={() => setShowOnboarding(false)} />}
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="find-matches" element={<FindMatches />} />
          <Route path="live-camera" element={<LiveCamera />} />
          <Route path="activity-log" element={<ActivityLog />} />
          <Route path="case-profiles" element={<CaseProfiles />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
