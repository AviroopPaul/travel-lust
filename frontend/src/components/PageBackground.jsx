import React from 'react';

const PageBackground = () => {
  return (
    <div className="fixed inset-0 pointer-events-none">
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[#1a1520] blur-[150px] opacity-60" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-[#15181a] blur-[120px] opacity-50" />
    </div>
  );
};

export default PageBackground;
