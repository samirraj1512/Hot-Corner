import React, { useCallback, useEffect, useState } from 'react'
import {  useParams } from 'react-router-dom'
import { assets,  } from '../assets/assets'
import Loading from '../components/Loading'
import { ArrowRightIcon, ClockIcon } from 'lucide-react'
import isoTimeFormat from '../lib/isoTimeFormat'
import BlurCircle from '../components/BlurCircle'
import toast from 'react-hot-toast'
import { useAppContext } from '../context/AppContextCore'

const Seatlayout = () => {

  const groupRows =[["A","B"],["C","D"],["E","F"],["G","H"],["I","J"]]

  const{id,date}=useParams()

  const[selectedSeats, setSelectedSeats]=useState([])
  const[selectedTime, setSelectedTime]=useState(null)
  const[show, setShow]=useState(null)
  const[occupiedSeats, setOccupiedSeats] = useState([])


  const {axios,getToken,user}=useAppContext();

  const getShow = useCallback(async () =>{
    try {

      const{data}= await axios.get(`/api/show/${id}`)
      if(data.success){
        setShow(data)
      }
      
    } catch (error) {
      console.log(error)
    }
  }, [axios, id])

  useEffect(()=>{
    getShow()
  },[getShow])

  const handleSeatClick=(seatId)=>{
    if(!selectedTime){
      return toast("Please select time first")
    }
    if(!selectedSeats.includes(seatId)&& selectedSeats.length >5){
      return toast("You Can only Select 6 Seat")
    }
    if(occupiedSeats.includes(seatId)){
      return toast('this seat is already booked')
    }
    setSelectedSeats(prev=> prev.includes(seatId)? prev.filter(seat=>seat!==seatId):[...prev,seatId])
  }

  const renderSeats = (row, count = 9) => (
  <div key={row} className="flex gap-2 mt-2">
    <div className="flex flex-wrap items-center justify-center gap-2">
      {Array.from({ length: count }, (_, i) => {
        const seatId = `${row}${i + 1}`;
        return (
          <button
            key={seatId}
            onClick={() => handleSeatClick(seatId)}
            
            className={`h-8 w-8 rounded border border-primary/60 cursor-pointer 
              ${selectedSeats.includes(seatId) && "bg-primary text-white"
            } ${occupiedSeats.includes(seatId)&&'opacity-45'}`}
          >
            {seatId}
          </button>
        );
      })}
    </div>
  </div>
);


    const getOccupiedSeats = useCallback(async ()=>{
      try {
        
        const {data} = await axios.get(`/api/booking/seats/${selectedTime.showId}`)
        if(data.success){
          setOccupiedSeats(data.occupiedSeats)
        }else(
          toast.error(data.message)
        )

      } catch (error) {
        console.log(error)
      }
    }, [axios, selectedTime])


      const bookTickets = async ()=>{
        try {
          if(!user) return toast.error('please log in first')

          if(!selectedTime || !selectedSeats.length) return toast.error('please select time and seats')

         const {data}= await axios.post('/api/booking/create',{showId: selectedTime.showId,selectedSeats},{
      headers:{Authorization:`Bearer ${await getToken()}`}
    })
      if(data.success){
        window.location.href=data.url;
      }else{
        toast.error(data.message)
      }

        } catch (error) {
          toast.error(error.message)
          
        }
      }





  

  useEffect(()=>{
    if(selectedTime){
      getOccupiedSeats()
    }
  },[getOccupiedSeats, selectedTime])

  const availableTimes = show?.dateTime?.[date] || []

  return show ? (
    <div className='flex flex-col md:flex-row px-6 md:px-16 lg:px-32 xl:px-50 py-30 md:pt-50'>
      {/* Available timings */}
        <div className='w-60 bg-primary/30 border border-primary/50 rounded-lg py-10 h-max md:sticky md:top-30'>

          <p className='text-lg font-semibold px-6'>Available Timings</p>
          <div className='mt-5 space-y-1'>
          {availableTimes.length > 0 ? availableTimes.map((item)=>(
            <div
              key={item.time}
              onClick={()=>{
                setSelectedTime(item)
                setSelectedSeats([])
              }}
              className={`flex items-centre gap-2 px-6 py-2 rounded-r-md font-medium cursor-pointer transition ${selectedTime?.time=== item.time ? "bg-primary text-white":"hover:bg-primary/50"}`}
            >
              <ClockIcon className='w-4 h-4 mt-2'/>
              <p className='text-sm py-1'>{isoTimeFormat(item.time)}</p>
            </div>
          )) : (
            <p className='px-6 text-sm text-gray-300'>No showtimes available for this date.</p>
          )}
        </div>
        </div>


      {/* seat layout */}
        <div className='relative flex-1 flex flex-col items-center max-md:mt-16'>
              <BlurCircle top='-100px' left='-100px'/>
              <BlurCircle bottom='0' right='0'/>
              <h1 className='text-2xl font-semibold mb-4'>Select your Seat</h1>
              <img src={assets.screenImage} alt="screen"/> 
              <p className='text-gray-400 text-sm mb-6'>Screen Side</p>

              <div className='flex flex-col items-center mt-10 text-xs text-gray-300'>
                <div className='grid grid-cols-2 md:grid-cols-1 gap-8 md:gap-2 mb-6 lg:gap-3'>
                  {groupRows[0].map(row => renderSeats(row))}
                </div>
               </div>
                <div className='grid grid-cols-2 gap-11 text-xs text-gray-300'>
                  
                    {groupRows.slice(1).map((group,idx)=>(
                      <div key={idx} >
                        {group.map(row => renderSeats(row))}
                      </div>

                    ))}
                    
    </div> 
                  <button  onClick={bookTickets}className=' flex items-center justify-center gap-1 mt-20 px-10 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer active:scale-95'>
          Proceed To Checkout          
          <ArrowRightIcon strokeWidth={3} className="w-4 h-4"/>
        </button>

                </div>
        </div>
         
       
    


  ):(<Loading/>)
}

export default Seatlayout
