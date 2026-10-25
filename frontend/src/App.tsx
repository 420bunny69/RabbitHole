import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AskPage } from './pages/AskPage'
import { ExplorePage } from './pages/ExplorePage'
import { GraphPage } from './pages/GraphPage'
import { ItemPage } from './pages/ItemPage'
import { Library } from './pages/Library'
import { NotFound } from './pages/NotFound'
import { RecentPage } from './pages/RecentPage'
import { TopicsPage } from './pages/TopicsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
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
