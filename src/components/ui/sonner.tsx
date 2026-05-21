import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="bottom-right"
      duration={4000}
      closeButton
      theme="dark"
      className="toaster group"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast !rounded-xl !border !shadow-lg !text-sm !font-medium",
          title: "!text-[#F0F0FF]",
          description: "!text-[#A8A8C0]",
          closeButton:
            "!bg-transparent !border-0 !text-[#A8A8C0] hover:!text-white hover:!bg-white/5",
          error:
            "!bg-[#1a1a2e] !border-[#5c1f2e] !text-[#F0F0FF]",
          success:
            "!bg-[#1a1a2e] !border-[#1f5c3a] !text-[#F0F0FF]",
          info: "!bg-[#1a1a2e] !border-[#2A2A3A] !text-[#F0F0FF]",
          warning:
            "!bg-[#1a1a2e] !border-[#5c4a1f] !text-[#F0F0FF]",
          default:
            "!bg-[#1a1a2e] !border-[#2A2A3A] !text-[#F0F0FF]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
