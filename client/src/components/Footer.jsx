
import { assets } from '../assets/assets'


const Footer = () => {
  return (
    <footer className="px-6  md:px-16 lg:px-36 mt-56 w-full text-gray-300">
            <div className="flex flex-col md:flex-row justify-between w-full gap-10 border-b border-gray-500 pb-14">
            
                <div className="md:max-w-96">
                  
                    <img className="w-36 h-auto" src={assets.logo} alt="logo" />
                    <p className="mt-6 text-sm">
                        I am Chinmay, a student at IIT Guwahati from the ECE 2023 batch. I'm passionate about full-stack web development using the MERN stack. I'm also an active member of the Game Development Club and the Cyber Security Club, where I explore my interests in creative coding, gameplay design, and digital security
                    </p>
                    <div className="flex items-center gap-2 mt-4">
                        <img src={assets.googlePlay} alt="google play" className="h-9 w-auto  rounded" />
                        <img src={assets.appStore} alt="app store" className="h-9 w-auto  rounded" />
                    </div>
                </div>
                <div className="flex-1 flex items-start md:justify-end gap-20 md:gap-40 mt-40">
                    <div>
                        <h2 className="font-semibold mb-5">Company</h2>
                        <ul className="text-sm space-y-2">
                            <li><a href="https://hot-corner.vercel.app/">Home</a></li>
                            <li><a href="https://portfoliocjstudio-bw8n.vercel.app/">About us</a></li>
                            <li><a href="https://portfoliocjstudio-bw8n.vercel.app/">Contact us</a></li>
                            
                        </ul>
                    </div>
                    <div>
                        <h2 className="font-semibold mb-5">Get in touch</h2>
                        <div className="text-sm space-y-2">
                            <p>+91-6398439263</p>
                            <p>chinmaybiswas475@gmail.com</p>
                        </div>
                    </div>
                </div>
            </div>
            <p className="pt-4 text-center text-sm pb-5">
                Copyright {new Date().getFullYear()} © CJ-Studio. All Rights Reserved.
            </p>
        </footer>
  )
}

export default Footer