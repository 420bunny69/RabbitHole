import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { GraphPage } from './pages/GraphPage'
import { ItemPage } from './pages/ItemPage'
import { Library } from './pages/Library'
import { NotFound } from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Library />} />
        <Route path="items/:id" element={<ItemPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}