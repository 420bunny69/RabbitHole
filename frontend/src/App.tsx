import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { GuestRoute } from './components/GuestRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AskPage } from './pages/AskPage'
import { ExplorePage } from './pages/ExplorePage'
import { GraphPage } from './pages/GraphPage'
import { ItemPage } from './pages/ItemPage'
import { Library } from './pages/Library'
import { LoginPage } from './pages/LoginPage'
import { NotFound } from './pages/NotFound'
import { RecentPage } from './pages/RecentPage'
import { RegisterPage } from './pages/RegisterPage'
import { TopicsPage } from './pages/TopicsPage'
import { VerificationLinkErrorPage } from './pages/VerificationLinkErrorPage'
import { WorkspaceClaimPage } from './pages/WorkspaceClaimPage'
import { useAuth } from './contexts/AuthContext'

export default function App() {
  const { verificationLinkExpired } = useAuth()

  if (verificationLinkExpired) return <VerificationLinkErrorPage />

  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route
        path="/claim-workspace"
        element={
          <ProtectedRoute requireWorkspace={false}>
            <WorkspaceClaimPage />
          </ProtectedRoute>
        }
      />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Library />} />
        <Route path="items/:id" element={<ItemPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="topics" element={<TopicsPage />} />
        <Route path="recent" element={<RecentPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
