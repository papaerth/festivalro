import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Candidates from './pages/Candidates'
import CandidateDetail from './pages/CandidateDetail'
import Videos from './pages/Videos'
import VideoDetail from './pages/VideoDetail'
import Channels from './pages/Channels'
import Products from './pages/Products'
import Schedule from './pages/Schedule'
import DataPage from './pages/DataPage'
import SettingsPage from './pages/SettingsPage'
import Studio from './pages/Studio'
import Styles from './pages/Styles'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/make/:id" element={<Studio />} />
        <Route path="/styles" element={<Styles />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/candidates/:id" element={<CandidateDetail />} />
        <Route path="/videos" element={<Videos />} />
        <Route path="/videos/:id" element={<VideoDetail />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/products" element={<Products />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<div className="card p-8">페이지를 찾을 수 없습니다.</div>} />
      </Route>
    </Routes>
  )
}
