
import  {  useCallback, useEffect, useState } from 'react'
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { dateFormat } from '../../lib/dateFormat';
import { useAppContext } from '../../context/AppContextCore';
import { Trash2Icon } from 'lucide-react';
import toast from 'react-hot-toast';

const ListShows = () => {

    const currency = import.meta.env.VITE_CURRENCY;

    const{axios,getToken,user}=useAppContext();

     const [shows,setShows]=useState([])
     const [loading, setLoading] = useState(true);
     const [deletingShowId,setDeletingShowId]=useState(null);
     const [error, setError] = useState('');
     
     const getAllShows = useCallback(async ()=>{
        try{
            setLoading(true);
            setError('');
            const {data}= await axios.get('/api/admin/all-shows',{
      headers:{Authorization:`Bearer ${await getToken()}`}
    });

    if(data.success){
        setShows(data.shows)
    }else{
        throw new Error(data.message || 'Could not load shows')
    }
        } catch(error){
            console.error(error)
            setError(error.response?.data?.message || error.message || 'Could not load shows')
        } finally {
            setLoading(false);
        }
     }, [axios, getToken])

     const handleDeleteShow = async(show)=>{
        const confirmed = window.confirm(`Delete ${show.movie?.title || 'this'} show? Shows with paid bookings are kept to protect booking history.`);
        if(!confirmed) return;

        try{
            setDeletingShowId(show._id)
            const {data}= await axios.delete(`/api/show/${show._id}`,{
                headers:{Authorization:`Bearer ${await getToken()}`}
            });

            if(data.success){
                toast.success(data.message)
                setShows((currentShows)=>currentShows.filter((item)=>item._id !== show._id))
            }else{
                toast.error(data.message)
            }
        } catch(error){
            console.error(error)
            toast.error(error.response?.data?.message || error.message)
        } finally {
            setDeletingShowId(null)
        }
     }

     useEffect(()=>{

        if(user){
                getAllShows();
        }
        
     },[getAllShows, user]);

  return !loading?(
    <>
    <Title text1="List" text2="Shows"/>
    {error ? (
      <div className='mt-6 flex flex-wrap items-center justify-between gap-3 border border-red-300/25 bg-red-300/10 px-4 py-3 rounded-md text-sm text-red-100'>
        <p>{error}</p>
        <button onClick={getAllShows} className='h-9 px-3 border border-red-200/30 hover:bg-red-200/10 rounded-md cursor-pointer'>Retry</button>
      </div>
    ) : (
    <div className='max-w-5xl mt-6 overflow-x-auto'>
        <table className='w-full border-collapse rounded-md overflow-hidden text-nowrap'>
        <thead>
            <tr className='bg-primary/50 text-left text-white'>


            <th className='p-2 font-medium pl-5'>Movie Name</th>
            <th className='p-2 font-medium pl-5'>Show Time</th>
            <th className='p-2 font-medium pl-5'>Paid Bookings</th>
            <th className='p-2 font-medium pl-5'>Tickets</th>
            <th className='p-2 font-medium pl-5'>Revenue</th>
            <th className='p-2 font-medium pl-5'>Action</th>

            </tr>
        </thead>
        <tbody className='text-sm font-light'>
            {shows.map((show)=>(
                <tr key={show._id} className='border-b border-primary/20 bg-primary-dull/15 even:bg-primary/20'>
                    <td className='p-2 min-w-45 pl-5'>{show.movie?.title || 'Movie unavailable'}</td>
                    <td className='p-2 '>{dateFormat(show.showDateTime)}</td>
                    <td className='p-2 '>{show.paidBookingCount || 0}</td>
                    <td className='p-2 '>{show.paidSeatCount || 0}</td>
                    <td className='p-2 '>{currency}{show.totalRevenue || 0}</td>
                    <td className='p-2 pl-5'>
                        <button
                            onClick={()=>handleDeleteShow(show)}
                            disabled={deletingShowId === show._id}
                            className='inline-flex items-center justify-center w-8 h-8 rounded bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition disabled:opacity-50 cursor-pointer'
                            title='Delete show'
                        >
                            <Trash2Icon className='w-4 h-4'/>
                        </button>
                    </td>

                </tr>
            ))}
            {!shows.length && (
                <tr><td colSpan='6' className='p-10 text-center text-gray-400'>There are no upcoming shows.</td></tr>
            )}

        </tbody>

        </table>

    </div>
    )}
    </>
  ):(<Loading/>)
}

export default ListShows
