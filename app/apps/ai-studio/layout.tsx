export default function AIStudioLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-screen w-screen overflow-y-auto bg-[#0a0c10]">
            {children}
        </div>
    );
}
