import React, { useCallback, useEffect, useState } from 'react'
import Loading from '../components/Loading'
import BlurCircle from '../components/BlurCircle'

import timeFormat from '../lib/timeFormat'
import { dateFormat } from '../lib/dateFormat'
import { useAppContext } from '../context/AppContextCore'
import { Link } from 'react-router-dom'

const MyBookings = () => {

    const currency= import.meta.env.VITE_CURRENCY

    const {axios,getToken,user,image_base_url}=useAppContext();

    const[bookings,setBookings] =useState([])
    const[isLoading, setIsLoading]=useState(true)

    const getMyBookings = useCallback(async ()=>{
      try {
        setIsLoading(true)
        const {data}= await axios.get('/api/user/bookings',{
      headers:{Authorization:`Bearer ${await getToken()}`}
    })

    if(data.success){
      setBookings(data.bookings)
    }
      } catch (error) {
        console.log(error)
      } finally {
        setIsLoading(false)
      }
}, [axios, getToken])
    useEffect(()=>{
     if(user){
       getMyBookings()
     }else{
       setBookings([])
       setIsLoading(false)
     }
    },[getMyBookings, user])

  return !isLoading ?(
    <div className='relative px-6 md:px-16 lg:px-36 pt-30 md:pt-40 min-h-[80vh]'>
      <BlurCircle top='100px' left='100px'/>
      <div>
      <BlurCircle bottom='0px' left='800px'/>
      </div>
      <h1 className='text-lg font-semibold mb-4'>My Bookings</h1>

      {bookings.map((item, index) => (
  <div
    key={index}
    className="flex flex-col lg:flex-row justify-between bg-primary/20 border border-primary/40 rounded-lg mt-4 p-4 sm:p-6 lg:p-8 xl:p-10 max-w-6xl mx-auto"
  >
    {/* Left: Image + Info */}
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
      <img
        src={image_base_url + item.show.movie.poster_path}
        alt=""
        className="w-full sm:w-44 md:w-52 lg:w-60 aspect-video object-cover object-bottom rounded"
      />
      <div className="flex flex-col justify-between">
        <p className="text-base sm:text-lg font-semibold">{item.show.movie.title}</p>
        <p className="text-lg sm:text-base text-gray-400">{timeFormat(item.show.movie.runtime)}</p>
        <p className="text-lg sm:text-base text-gray-400 ">{dateFormat(item.show.showDateTime)}</p>
      </div>
    </div>
        <div className='flex flex-col md:items-end md:text-right justify-between p-4'>
          <div className='flex items-center gap-4'>
            <p className='text-2xl font-bold mb-3'>{currency}{item.amount}</p>
            {!item.isPaid && <Link to={item.paymentLink} className='bg-primary px-4 py-1.5 mb-3 text-sm rounded-full font-medium cursor-pointer'>Pay Noy</Link>}

          </div>
          <div className='text-sm text-left'>
            <p className='text-right'><span className='text-gray-400 '>Total Tickit:</span> {item.bookedSeats.length}</p>
            <p ><span className='text-gray-400'>Seat Number:</span> {item.bookedSeats.join(", ")}</p>
          </div>
        </div>


  </div>
))}



      </div>


  ):(<Loading />)
}

export default MyBookings
