import React, { useCallback, useEffect, useState } from 'react'

import Title from '../../components/admin/Title';
import Loading from '../../components/Loading';
import { dateFormat } from '../../lib/dateFormat';
import { useAppContext } from '../../context/AppContextCore';

const formatBookingDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

const ListBookings = () => {


  const{axios,getToken,user}=useAppContext(); 


  const currency = import.meta.env.VITE_CURRENCY
      const [bookings, setBookings] = useState([]);
      const [isLoading, setIsLoading] = useState(true)
      const [error, setError] = useState('')
  const getAllBookings = useCallback(async()=>{
    try {
      setIsLoading(true)
      setError('')
      const {data}= await axios.get('/api/admin/all-bookings',{
      headers:{Authorization:`Bearer ${await getToken()}`}
    });
    if(data.success){
      setBookings(data.bookings)
    } else {
      throw new Error(data.message || 'Could not load bookings')
    }
    } catch (error) {
       console.error(error)
       setError(error.response?.data?.message || error.message || 'Could not load bookings')
    } finally {
      setIsLoading(false)
    }
  }, [axios, getToken]);

  useEffect(() => {
    if(user){getAllBookings();}
  }, [getAllBookings, user]);



  return !isLoading ?(
    <>
      <Title text1="List" text2="Bookings"/> 
      {error ? (
        <div className='mt-6 flex flex-wrap items-center justify-between gap-3 border border-red-300/25 bg-red-300/10 px-4 py-3 rounded-md text-sm text-red-100'>
          <p>{error}</p>
          <button onClick={getAllBookings} className='h-9 px-3 border border-red-200/30 hover:bg-red-200/10 rounded-md cursor-pointer'>Retry</button>
        </div>
      ) : (
      <div className='max-w-6xl mt-6 overflow-x-auto'>
        <table className='w-full border-collapse rounded-md overflow-hidden text-nowrap'>

          <thead>
            <tr className='bg-primary/50 text-left text-white'>

            <th className='p-2 font-medium pl-5'>User Name</th>
            <th className='p-2 font-medium pl-5'>Contact</th>
            <th className='p-2 font-medium pl-5'>Movie Name</th>
            <th className='p-2 font-medium pl-5'>Show Time</th>
            <th className='p-2 font-medium pl-5'>Seats</th>
            <th className='p-2 font-medium pl-5'>Amount</th>
            <th className='p-2 font-medium pl-5'>Status</th>
            <th className='p-2 font-medium pl-5'>Booked On</th>

            </tr>
        </thead>
        <tbody className='text-sm font-light'>
                    {bookings.map((item)=>(
                        <tr key={item._id} className='border-b border-primary/20 bg-primary-dull/15 even:bg-primary/20'>
                            <td className='p-2 min-w-45 pl-5'>{item.user?.name || 'Deleted user'}</td>
                            <td className='p-2 min-w-55 pl-5'>
                              <p>{item.customerEmail || item.user?.email}</p>
                              <p className='text-gray-400'>{item.customerPhone || item.user?.phone || 'No phone'}</p>
                            </td>
                            <td className='p-2 min-w-45 pl-5'>{item.show?.movie?.title || 'Deleted show'}</td>
                            <td className='p-2 '>{item.show?.showDateTime ? dateFormat(item.show.showDateTime) : '-'}</td>
                            <td className='p-2 '>{Array.isArray(item.bookedSeats) ? item.bookedSeats.join(', ') : '-'}</td>
                            <td className='p-2 '>{currency}{item.amount}</td>
                            <td className='p-2 '><span className={`inline-flex px-2 py-1 rounded-md text-xs ${item.isPaid ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/10 text-amber-100'}`}>{item.isPaid ? 'Paid' : 'Pending'}</span></td>
                            <td className='p-2 '>{formatBookingDate(item.createdAt)}</td>
        
                        </tr>
                    ))}
                    {!bookings.length && <tr><td colSpan='8' className='p-10 text-center text-gray-400'>There are no bookings yet.</td></tr>}
        
                </tbody>


        </table>
        
      </div>
      )}
    </>
  ):(<Loading/> )
}


export default ListBookings
