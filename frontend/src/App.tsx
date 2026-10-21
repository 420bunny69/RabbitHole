import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ItemPage } from './pages/ItemPage'
import { Library } from './pages/Library'
import { NotFound } from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Library />} />
        <Route path="items/:id" element={<ItemPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
