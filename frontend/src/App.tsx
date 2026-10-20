import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AgentDetailPage } from './pages/AgentDetailPage'
import { DashboardPage } from './pages/DashboardPage'
import { JobDetailPage } from './pages/JobDetailPage'
import { WorkspacePage } from './pages/WorkspacePage'

export default function App() {
  return <BrowserRouter><Routes><Route element={<AppShell />}><Route index element={<DashboardPage />} /><Route path="agents" element={<WorkspacePage />} /><Route path="agents/:agentId" element={<AgentDetailPage />} /><Route path="jobs" element={<WorkspacePage />} /><Route path="jobs/:jobId" element={<JobDetailPage />} /><Route path="escrow" element={<WorkspacePage />} /><Route path="disputes" element={<WorkspacePage />} /><Route path="settings" element={<WorkspacePage />} /></Route></Routes></BrowserRouter>
}
