import { Calendar, Phone, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PLATFORM } from "@/components/landing/constants";

export function PlatformContactCard({ onMessageClick }: { onMessageClick?: () => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Contact Platform Support
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => window.open(`tel:${PLATFORM.phone}`, "_self")}
          >
            <Phone className="w-4 h-4 text-primary" />
            Call {PLATFORM.phoneDisplay}
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => window.open(`sms:${PLATFORM.phone}`, "_self")}
          >
            <MessageSquare className="w-4 h-4 text-primary" />
            Text {PLATFORM.phoneDisplay}
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => window.open(`mailto:${PLATFORM.supportEmail}`, "_blank")}
          >
            <Mail className="w-4 h-4 text-primary" />
            {PLATFORM.supportEmail}
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => window.open(PLATFORM.calUrl, "_blank")}
          >
            <Calendar className="w-4 h-4 text-primary" />
            Book a Meeting
          </Button>
        </div>
        {onMessageClick && (
          <Button onClick={onMessageClick} className="w-full">
            <MessageSquare className="w-4 h-4 mr-2" />
            Send a Message
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
