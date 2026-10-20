import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AgentDetailPage } from './pages/AgentDetailPage'
import { AgreementPage } from './pages/AgreementPage'
import { DashboardPage } from './pages/DashboardPage'
import { CreateJobPage } from './pages/CreateJobPage'
import { EscrowPage } from './pages/EscrowPage'
import { JobsPage } from './pages/JobsPage'
import { JobDetailPage } from './pages/JobDetailPage'
import { MatchingPage } from './pages/MatchingPage'
import { WorkspacePage } from './pages/WorkspacePage'

export default function App() {
  return <BrowserRouter><Routes><Route element={<AppShell />}><Route index element={<DashboardPage />} /><Route path="agents" element={<WorkspacePage />} /><Route path="agents/:agentId" element={<AgentDetailPage />} /><Route path="jobs" element={<JobsPage />} /><Route path="jobs/new" element={<CreateJobPage />} /><Route path="jobs/:jobId/matching" element={<MatchingPage />} /><Route path="jobs/:jobId/agreement" element={<AgreementPage />} /><Route path="jobs/:jobId/escrow" element={<EscrowPage />} /><Route path="jobs/:jobId" element={<JobDetailPage />} /><Route path="escrow" element={<WorkspacePage />} /><Route path="disputes" element={<WorkspacePage />} /><Route path="settings" element={<WorkspacePage />} /></Route></Routes></BrowserRouter>
}
