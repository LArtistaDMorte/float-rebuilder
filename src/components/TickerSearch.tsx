import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TickerSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
}

const TickerSearch = ({ value, onChange, onSearch }: TickerSearchProps) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSearch();
    }
  };

  return (
    <div className="flex gap-2 w-full max-w-md">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          type="text"
          placeholder="Enter ticker symbol (e.g., AAPL, TSLA)"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          className="pl-10 bg-card border-border"
        />
      </div>
      <Button onClick={onSearch} className="bg-primary hover:bg-primary/90">
        Search
      </Button>
    </div>
  );
};

export default TickerSearch;
