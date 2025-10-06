import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

interface CorporateAction {
  date: string;
  type: "split" | "offering" | "warrant" | "dilution";
  description: string;
  impact: string;
}

interface CorporateActionsTimelineProps {
  actions: CorporateAction[];
}

const CorporateActionsTimeline = ({ actions }: CorporateActionsTimelineProps) => {
  const getActionIcon = (type: string) => {
    switch (type) {
      case "split":
        return <RefreshCw className="h-4 w-4" />;
      case "offering":
        return <TrendingDown className="h-4 w-4" />;
      case "warrant":
        return <AlertCircle className="h-4 w-4" />;
      case "dilution":
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getActionColor = (type: string) => {
    switch (type) {
      case "split":
        return "bg-primary/20 text-primary border-primary/50";
      case "offering":
        return "bg-accent/20 text-accent border-accent/50";
      case "warrant":
        return "bg-yellow-500/20 text-yellow-500 border-yellow-500/50";
      case "dilution":
        return "bg-destructive/20 text-destructive border-destructive/50";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle>Corporate Actions Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {actions.map((action, index) => (
              <div key={index} className="flex gap-4 pb-4 border-b border-border last:border-0">
                <div className="flex flex-col items-center">
                  <div className={`p-2 rounded-full ${getActionColor(action.type)}`}>
                    {getActionIcon(action.type)}
                  </div>
                  {index !== actions.length - 1 && (
                    <div className="w-px h-full bg-border mt-2" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getActionColor(action.type)}>
                      {action.type.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{action.date}</span>
                  </div>
                  <p className="text-sm font-medium">{action.description}</p>
                  <p className="text-xs text-muted-foreground">{action.impact}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default CorporateActionsTimeline;
