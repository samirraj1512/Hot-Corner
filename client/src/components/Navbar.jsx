
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { assets } from '../assets/assets'
import { MenuIcon, SearchIcon, ShieldIcon, TicketPlus, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from 'react';
import { UserButton, useUser,SignInButton } from '@clerk/clerk-react';
import { useAppContext } from '../context/AppContextCore';

const AUTO_HIDE_DELAY_MS = 2600;

const Navbar = () => {
  const {favoriteMovies,isAdmin}=useAppContext();

    const [isOpen ,setIsOpen] = useState(false)
    const [autoHideEnabled, setAutoHideEnabled] = useState(false)
    const [isVisible, setIsVisible] = useState(true)
    const hideTimerRef = useRef(null)
    const pointerOverNavbarRef = useRef(false)
    const{user}=useUser()
    const navigate =useNavigate()
    const location = useLocation()
    const shouldAutoHide = location.pathname === '/'

    const clearHideTimer = useCallback(() => {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }, [])

    const scheduleHide = useCallback(() => {
      clearHideTimer()
      if (!autoHideEnabled || pointerOverNavbarRef.current || isOpen) return

      hideTimerRef.current = window.setTimeout(() => {
        if (!pointerOverNavbarRef.current && !isOpen) setIsVisible(false)
      }, AUTO_HIDE_DELAY_MS)
    }, [autoHideEnabled, clearHideTimer, isOpen])

    const revealNavbar = useCallback(() => {
      if (!autoHideEnabled) return
      setIsVisible(true)
      if (!pointerOverNavbarRef.current) scheduleHide()
    }, [autoHideEnabled, scheduleHide])

    useEffect(() => {
      if (!shouldAutoHide) {
        clearHideTimer()
        setAutoHideEnabled(false)
        setIsVisible(true)
        return undefined
      }

      const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
      const updateAutoHideSupport = () => {
        setAutoHideEnabled(mediaQuery.matches)
        setIsVisible(true)
      }

      updateAutoHideSupport()
      mediaQuery.addEventListener('change', updateAutoHideSupport)
      return () => {
        clearHideTimer()
        mediaQuery.removeEventListener('change', updateAutoHideSupport)
      }
    }, [clearHideTimer, shouldAutoHide])

    useEffect(() => {
      if (!autoHideEnabled) return undefined

      window.addEventListener('mousemove', revealNavbar, { passive: true })
      scheduleHide()
      return () => {
        window.removeEventListener('mousemove', revealNavbar)
        clearHideTimer()
      }
    }, [autoHideEnabled, clearHideTimer, revealNavbar, scheduleHide])

    useEffect(() => {
      if (isOpen) {
        clearHideTimer()
        setIsVisible(true)
        return
      }
      scheduleHide()
    }, [clearHideTimer, isOpen, scheduleHide])

    const handleNavbarEnter = () => {
      pointerOverNavbarRef.current = true
      clearHideTimer()
      setIsVisible(true)
    }

    const handleNavbarLeave = () => {
      pointerOverNavbarRef.current = false
      scheduleHide()
    }


  return (
    <div
      onMouseEnter={handleNavbarEnter}
      onMouseLeave={handleNavbarLeave}
      onFocusCapture={handleNavbarEnter}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) handleNavbarLeave()
      }}
      className={`fixed top-0 left-0 z-50 w-full flex items-center justify-between px-6 md:px-16 lg:px-36 py-5 transition-[transform,opacity] duration-300 ease-out ${autoHideEnabled && !isVisible ? '-translate-y-[120%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}
    >
        <Link to='/' className='max-md:flex-1'>
        <img src={assets.logo} alt="" className='w-42 h-auto' />
        </Link>
        <div className={`
  max-md:absolute 
  max-md:top-0 
  max-md:left-0 
  max-md:font-medium 
  max-md:text-lg 
  z-50 
  flex flex-col md:flex-row 
  items-center 
  max-md:justify-center 
  gap-8 
  px-8 py-3 
  max-md:h-screen
  md:rounded-full 
  backdrop-blur 
  bg-black/70 
  md:bg-white/10 
  md:border 
  border-gray-300/20 
  overflow-hidden
  transition-[width] 
  duration-300 ease-in-out
  ${isOpen ? 'max-md:w-full ' : 'max-md:w-0 max-md:px-0 max-md:py-0 '}

`}>

            <XIcon className='md:hidden absolute top-6 right-6 w-6 h-6 cursor-pointer' onClick={() => setIsOpen(!isOpen)}/>

            <Link onClick={()=>{scrollTo(0, 0); setIsOpen(false)}} to='/'>Home</Link>
            <Link onClick={()=>{scrollTo(0, 0); setIsOpen(false)}} to='/Releases'>Releases</Link>
            <Link onClick={()=>{scrollTo(0, 0); setIsOpen(false)}} to='/recommendation'>Recommendation</Link>
            <Link onClick={()=>{scrollTo(0, 0); setIsOpen(false)}} to='/movies'>Movies</Link>
            <Link onClick={()=>{scrollTo(0, 0); setIsOpen(false)}} to='/watch-together'>Watch Together</Link>
           {favoriteMovies.length>0 && <Link onClick={()=>{scrollTo(0, 0); setIsOpen(false)}} to='/favorites'>Favorites</Link>}
           {isAdmin && <Link onClick={()=>{scrollTo(0, 0); setIsOpen(false)}} to='/admin' className='flex items-center gap-1.5'><ShieldIcon className='w-4 h-4'/>Admin</Link>}
           
        </div>

        <div className='flex items-center gap-8'>
      <SearchIcon className='max-md:hidden w-6 h-6 cursor-pointer' />

      {!user ? (
        <SignInButton mode="modal">
          <button className='px-4 py-1 sm:px-7 sm:py-2 bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'>
            Login
          </button>
        </SignInButton>
      ) : (
        <UserButton afterSignOutUrl='/' >
            <UserButton.MenuItems>
                <UserButton.Action label='My Bookings' labelIcon={<TicketPlus width={15}/>} onClick={()=>navigate('/my-bookings')}/>
            </UserButton.MenuItems>
        </UserButton>
      )}
    </div>

        <MenuIcon className='max-md:ml-4 md:hidden w-8 h-8 cursor-pointer' onClick={() => setIsOpen(!isOpen)}/>

    </div>
  )
}

export default Navbar
