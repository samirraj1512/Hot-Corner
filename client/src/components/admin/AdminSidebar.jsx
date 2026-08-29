import React from 'react'
import {
  LayoutDashboardIcon,
  PlusSquareIcon,
  ListIcon,
  ListCollapseIcon,
  RadioIcon,
  UsersIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { assets } from '../../assets/assets'
import { useAppContext } from '../../context/AppContextCore'

const AdminSidebar = () => {
    const { user } = useAppContext()
    const displayName = user?.fullName || user?.firstName || 'Admin'

     const adminNavlinks = [
  { name: 'Dashboard', path: '/admin', icon: LayoutDashboardIcon },
  { name: 'Add Shows', path: '/admin/add-shows', icon: PlusSquareIcon },
  { name: 'List Shows', path: '/admin/list-shows', icon: ListIcon },
  { name: 'List Bookings', path: '/admin/list-bookings', icon: ListCollapseIcon },
  { name: 'List Users', path: '/admin/list-users', icon: UsersIcon },
  { name: 'Watch Together', path: '/admin/watch-together', icon: RadioIcon },
]  


  return (
    <div className='h-[calc(100vh-64px)] flex md:flex flex-col items-center  pt-8 max-w-10 md:max-w-60 w-full border-r border-primary-dull/20 text-lg'>
            <img className='h-9 md:h-14 w-9 md:w-14 rounded-full mx-auto' src={user?.imageUrl || assets.profile} alt="Admin profile"/>
            <p className='mt-2 text-base max-md:hidden truncate max-w-52'>{displayName}</p>

            <div className='w-full gap-6'>
                {adminNavlinks.map((link, index)=>(
                    <NavLink key={index} to={link.path} end className={({isActive})=>`relative flex items-center max-md:justify-center gap-6 w-full py-2.5 min-md:pl-10 first:mt-6 text-gray-400 ${!isActive && 'hover:bg-primary/10'} ${isActive && 'bg-primary/20 text-primary group'}`}>
                        {({isActive})=>(
                            <>
                                <link.icon className='w-5 h-5'/>
                                <p className='max-md:hidden'>{link.name}</p>
                                <span className={`w-1.5 h-10 rounded-1 right-0 absolute ${isActive && 'bg-primary'}`}/>
                            </>
                        )}

                    </NavLink>
                ))}

            </div>
        
    </div>
  )
}

export default AdminSidebar
