//Admin dashboard showing 4 stat cards (bookings, revenue, shows, users) and a grid of all active shows.
import { ChartLineIcon, CircleDollarSignIcon, PlayCircleIcon, RefreshCwIcon, StarIcon, UsersIcon } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react'

import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import BlurCircle from '../../components/BlurCircle';
import { dateFormat } from '../../lib/dateFormat';
import { useAppContext } from '../../context/AppContextCore';



const Dashboard = () => {

    const currency = import.meta.env.VITE_CURRENCY;
    const{axios,getToken,user,image_base_url}=useAppContext();

const [dashboardData, setDashboardData] = useState({
  totalBookings: 0,
  totalRevenue: 0,
  activeShows: [],
  totalUsers: 0
});

const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

const dashboardCards = [
  { title: "Total Bookings", value: dashboardData.totalBookings || "0", icon: ChartLineIcon },
  { title: "Total Revenue", value: `${currency || ''}${dashboardData.totalRevenue || 0}`, icon: CircleDollarSignIcon },
  { title: "Active Shows", value: dashboardData.activeShows.length || "0", icon: PlayCircleIcon},
  { title: "Total Users", value: dashboardData.totalUsers || dashboardData.totalUser || "0", icon: UsersIcon }
];

const fetchDashboardData = useCallback(async () => {
 
  try {
    setLoading(true)
    setError('')
    const {data}= await axios.get("/api/admin/dashboard",{
      headers:{Authorization:`Bearer ${await getToken()}`}
    })
   if(data.success){
            setDashboardData(data.dashboardData)
          }
          else{
            throw new Error(data.message || 'Could not load dashboard data')
          }
      } catch (error) {
        console.error(error)
        setError(error.response?.data?.message || error.message || 'Could not load dashboard data')

      } finally {
        setLoading(false)
      }
    }, [axios, getToken]);

useEffect(() => {

  if (user){
    fetchDashboardData();
  }
  
}, [fetchDashboardData, user]);

return !loading ?(
  <>
    <div className='flex flex-wrap items-center justify-between gap-4'>
      <Title text1="Admin" text2=" Dashboard"/>
      <button onClick={fetchDashboardData} title='Refresh dashboard' aria-label='Refresh dashboard' className='w-10 h-10 flex items-center justify-center border border-white/15 hover:border-primary hover:bg-primary/10 rounded-md transition cursor-pointer'>
        <RefreshCwIcon className='w-4 h-4'/>
      </button>
    </div>
    {error ? (
      <div className='mt-6 flex flex-wrap items-center justify-between gap-3 border border-red-300/25 bg-red-300/10 px-4 py-3 rounded-md text-sm text-red-100'>
        <p>{error}</p>
        <button onClick={fetchDashboardData} className='h-9 px-3 border border-red-200/30 hover:bg-red-200/10 rounded-md cursor-pointer'>Retry</button>
      </div>
    ) : <>
    <div className='relative flex flex-wrap gap-4 mt-6'> <BlurCircle top='-100px' left='0'/>
        <div className='relative flex flex-wrap lg:gap-4 xl:gap-10 w-full '>
            {dashboardCards.map((card, index)=>(
            <div key={index} className='flex items-center justify-between px-4 py-3 mt-3 mr-3 bg-primary/20 border border-primary/30 rounded-md max-w-50 w-full'>
                <div>
                    <h1 className='text-sm'>{card.title}</h1>
                    <p className='text-xl font-medium mt-1'>{card.value}</p>
                </div>
                <card.icon className='w-6 h-6'/>

            </div>))}

       

        </div>
    </div> <p className="mt-10 text-lg font-medium">Active Shows</p>
    <div className="relative flex flex-wrap lg:gap-6 xl:gap-16 mt-4 max-w-10xl">
        <BlurCircle top="100px" left="-10%" />

            {dashboardData.activeShows.map((show) => (
    <div key={show._id} className="w-55 rounded-lg overflow-hidden h-full pb-3 bg-primary/10 border border-primary/20 hover:-translate-y-1 transition duration-300">
      <img src={show.movie?.poster_path ? image_base_url + show.movie.poster_path : '/backgroundImage.png'} alt="" className="h-60 w-full object-cover"/>
      <p className="font-medium p-2 truncate">{show.movie?.title || 'Movie unavailable'}</p>
      <div className="flex items-center justify-between px-2">
        <p className="text-lg font-medium">
          {currency} {show.showPrice}
        </p>
        <p className="flex items-center gap-1 text-sm text-gray-400 mt-1 pr-1">
          <StarIcon className="w-4 h-4 text-primary fill-primary" />
          {Number(show.movie?.vote_average || 0).toFixed(1)}
        </p>
      </div>
      <p>{dateFormat(show.showDateTime)}</p>
    </div>
  ))}
  {!dashboardData.activeShows.length && <p className='text-sm text-gray-400'>There are no upcoming shows.</p>}
</div>
    </>}

  </>
):


(<Loading/>)

}

export default Dashboard
