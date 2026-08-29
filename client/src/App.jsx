import React from 'react'
import Navbar from './components/Navbar'
import { Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Movies from './pages/Movies'
import MovieDetails from './pages/MovieDetails'
import Seatlayout from './pages/Seatlayout'
import MyBookings from './pages/MyBookings'
import Favorites from './pages/Favorites'
import Releases from './pages/Releases'
import {Toaster} from 'react-hot-toast'
import Footer from './components/Footer'
import Dashboard from './pages/admin/Dashboard'
import Layout from './pages/admin/Layout'
import ListBookings from './pages/admin/ListBookings'
import ListShows from './pages/admin/ListShows'
import AddShows from './pages/admin/AddShows'
import ListUsers from './pages/admin/ListUsers'
import WatchTogetherAdmin from './pages/admin/WatchTogether'
import { useAppContext } from './context/AppContextCore'
import { SignIn } from '@clerk/clerk-react'
import Loading from './components/Loading.jsx'
import Recommendation from './pages/Theaters.jsx'
import WatchTogetherPage from './features/watchTogether/WatchTogetherPage.jsx'









const App = () => {
const isAdminRoute = useLocation().pathname.startsWith('/admin');
const { user} = useAppContext();






  return (
    <>
    <Toaster/>
      {!isAdminRoute && <Navbar/>}
      <Routes>
        <Route path='/' element={<Home/>}/>
        <Route path='/movies' element={<Movies/>}/>
        <Route path='/movies/:id' element={<MovieDetails/>}/>
        <Route path='/movies/:id/:date' element={<Seatlayout/>}/> 
        <Route path='/my-bookings' element={<MyBookings/>}/> 
        <Route path='/loading/:nextUrl' element={<Loading/>}/>

        <Route path='/favorites' element={<Favorites/>}/>
        <Route path='/Recommendation' element={<Recommendation/>}/>
        <Route path='/recommendation' element={<Recommendation/>}/>
        <Route path='/Theaters' element={<Recommendation/>}/>
        <Route path='/theaters' element={<Recommendation/>}/>
        <Route path='/Releases' element={<Releases/>}/>
        <Route path='/releases' element={<Releases/>}/>
        <Route path='/watch-together' element={<WatchTogetherPage/>}/>
        <Route path='/watch-together/:roomCode' element={<WatchTogetherPage/>}/>
        <Route path="/admin/*" element={user ? <Layout/>:(<div className='min-h-screen flex justify-center items-center'>
          <SignIn fallbackRedirectUrl={'/admin'}/>
        </div>) }>
  <Route index element={<Dashboard />} />
  <Route path="add-shows" element={<AddShows />} />
  <Route path="list-shows" element={<ListShows />} />
  <Route path="list-bookings" element={<ListBookings />} />
  <Route path="list-users" element={<ListUsers />} />
  <Route path="watch-together" element={<WatchTogetherAdmin />} />
</Route>


        </Routes>
       {!isAdminRoute && <Footer/>} 
    </>
  )
}

export default App
