import React from "react";
import { Search } from "lucide-react";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> { }

export default function SearchInput(props: SearchInputProps) {
  return (
    <div className="search-input-wrap">
      <Search size={16} />
      <input className="form-input" placeholder="Search..." {...props} />
    </div>
  );
}
