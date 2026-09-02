import * as React from 'react'
import { useState } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  placeholder?: string;
  icon?: React.ReactNode;
}

export const AppInput = (props: InputProps) => {
  const { label, placeholder, icon, ...rest } = props;
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLInputElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  return (
    <div className="w-full min-w-[200px] relative text-left">
      {label && (
        <label className="block mb-2 text-sm text-[var(--color-heading)] font-medium">
          {label}
        </label>
      )}
      <div className="relative w-full">
        <input
          type="text"
          className="peer relative z-10 border-2 border-[var(--color-border)] h-12 w-full rounded-md bg-[var(--color-surface)] px-4 font-normal text-[var(--color-heading)] outline-none drop-shadow-sm transition-all duration-200 ease-in-out focus:bg-[var(--color-bg)] focus:border-emerald-500/50 placeholder:font-medium placeholder:text-[var(--color-text-secondary)]"
          placeholder={placeholder}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          {...rest}
        />
        {isHovering && (
          <>
            <div
              className="absolute pointer-events-none top-0 left-0 right-0 h-[2px] z-20 rounded-t-md overflow-hidden"
              style={{
                background: `radial-gradient(45px circle at ${mousePosition.x}px 0px, var(--color-brand-emerald, #10b981) 0%, transparent 80%)`,
              }}
            />
            <div
              className="absolute pointer-events-none bottom-0 left-0 right-0 h-[2px] z-20 rounded-b-md overflow-hidden"
              style={{
                background: `radial-gradient(45px circle at ${mousePosition.x}px 2px, var(--color-brand-emerald, #10b981) 0%, transparent 80%)`,
              }}
            />
          </>
        )}
        {icon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 text-[var(--color-text-secondary)]">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export interface Login1Props {
  onSignIn?: (email: string, pass: string) => void;
  imageSrc?: string;
  title?: string;
  subtitle?: string;
}

const Page = ({
  onSignIn,
  imageSrc = '/speech-analytics-hero.jpg',
  title = 'Sign in',
  subtitle = 'or use your account',
}: Login1Props) => {
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleMouseMove = (e: React.MouseEvent) => {
    const leftSection = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - leftSection.left,
      y: e.clientY - leftSection.top
    });
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const socialIcons = [
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
          <path fill="currentColor" d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4zm9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8A1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5a5 5 0 0 1-5 5a5 5 0 0 1-5-5a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3"/>
        </svg>
      ),
      href: '#',
      gradient: 'bg-[var(--color-bg)]',
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
          <path fill="currentColor" d="M6.94 5a2 2 0 1 1-4-.002a2 2 0 0 1 4 .002M7 8.48H3V21h4zm6.32 0H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91z"/>
        </svg>
      ),
      href: '#',
      bg: 'bg-[var(--color-bg)]',
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
          <path fill="currentColor" d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 0 1 1-1h3v-4h-3a5 5 0 0 0-5 5v2.01h-2l-.396 3.98h2.396z"/>
        </svg>
      ),
      href: '#',
      bg: 'bg-[var(--color-bg)]',
    }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSignIn) {
      onSignIn(email, password);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--color-bg)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Moving Ambient Gradient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] bg-emerald-500/15 rounded-full blur-[130px] pointer-events-none animate-orb-1" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-teal-500/15 rounded-full blur-[130px] pointer-events-none animate-orb-2" />
      <div className="absolute top-[40%] right-[30%] w-[400px] h-[400px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none animate-orb-3" />

      <div className="card w-[95%] sm:w-[90%] md:w-[85%] lg:w-[75%] max-w-5xl flex flex-col lg:flex-row justify-between min-h-[580px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden relative z-10 backdrop-blur-md">
        {/* Left Side: Interactive Form */}
        <div
          className="w-full lg:w-1/2 px-6 sm:px-10 lg:px-12 py-10 left h-full relative overflow-hidden flex flex-col justify-center"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Mouse follow radial glow */}
          <div
            className={`absolute pointer-events-none w-[500px] h-[500px] bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-sky-500/15 rounded-full blur-3xl transition-opacity duration-300 ${
              isHovering ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: `translate(${mousePosition.x - 250}px, ${mousePosition.y - 250}px)`,
              transition: 'transform 0.08s ease-out'
            }}
          />

          <div className="form-container sign-in-container z-10 w-full max-w-sm mx-auto">
            <form className="text-center grid gap-4" onSubmit={handleSubmit}>
              <div className="grid gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-extrabold text-[var(--color-heading)] tracking-tight">
                  {title}
                </h1>
                
                <div className="social-container">
                  <div className="flex items-center justify-center">
                    <ul className="flex gap-3 md:gap-4 p-0 m-0">
                      {socialIcons.map((social, index) => (
                        <li key={index} className="list-none">
                          <a
                            href={social.href}
                            className="w-[2.6rem] h-[2.6rem] bg-[var(--color-bg-2)] rounded-full flex justify-center items-center relative z-[1] border-2 border-[var(--color-text-primary)] overflow-hidden group shadow-md"
                          >
                            <div
                              className={`absolute inset-0 w-full h-full ${
                                social.gradient || social.bg
                              } scale-y-0 origin-bottom transition-transform duration-500 ease-in-out group-hover:scale-y-100`}
                            />
                            <span className="text-[1.25rem] text-[hsl(203,92%,8%)] transition-all duration-500 ease-in-out z-[2] group-hover:text-[var(--color-text-primary)]">
                              {social.icon}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <span className="text-sm text-[var(--color-text-secondary)]">{subtitle}</span>
              </div>

              <div className="grid gap-3.5 items-center">
                <AppInput
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <AppInput
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <a href="#" className="font-light text-xs md:text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-heading)] transition-colors">
                Forgot your password?
              </a>

              <div className="flex gap-4 justify-center items-center mt-2">
                <button
                  type="submit"
                  className="group/button relative inline-flex justify-center items-center overflow-hidden rounded-md bg-emerald-600 hover:bg-emerald-500 px-8 py-2.5 text-sm font-semibold text-white transition-all duration-300 ease-in-out hover:scale-[1.03] hover:shadow-lg hover:shadow-emerald-500/25 cursor-pointer"
                >
                  <span className="relative z-10">Sign In</span>
                  <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-13deg)_translateX(-100%)] group-hover/button:duration-1000 group-hover/button:[transform:skew(-13deg)_translateX(100%)]">
                    <div className="relative h-full w-8 bg-white/20" />
                  </div>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Side: Product Visual Hero with Movement */}
        <div className="hidden lg:block w-1/2 right h-full relative overflow-hidden bg-black/40 min-h-[580px]">
          <img
            src={imageSrc}
            alt="Convert-IA Speech Analytics"
            className="w-full h-full object-cover animate-zoom-breathe opacity-85"
            loading="eager"
          />
          {/* Moving Laser Scanline */}
          <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#10b981] animate-scanline pointer-events-none" />

          {/* Equalizer Waveform overlay */}
          <div className="absolute top-6 right-6 z-20 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/50 border border-emerald-500/30 backdrop-blur-md">
            <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider mr-1">Live Audio</span>
            {[50, 80, 100, 60, 90, 40, 70, 95].map((h, i) => (
              <span
                key={i}
                className="w-[2px] bg-emerald-400 rounded-full"
                style={{
                  height: '12px',
                  animation: `audioBarBounce 1.${(i % 4) + 2}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>

          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-transparent to-black/30 pointer-events-none" />
          <div className="absolute bottom-6 left-6 right-6 p-4 rounded-xl backdrop-blur-md bg-black/50 border border-white/10 text-white pointer-events-none">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">Convert-IA Intelligence</p>
            <p className="text-sm text-gray-200">Analítica conversacional en tiempo real con IA avanzada.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page;
