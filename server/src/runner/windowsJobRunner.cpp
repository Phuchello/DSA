#define _UNICODE
#include <windows.h>
#include <algorithm>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#ifndef PROC_THREAD_ATTRIBUTE_JOB_LIST
#define PROC_THREAD_ATTRIBUTE_JOB_LIST ProcThreadAttributeValue(13, FALSE, TRUE, FALSE)
#endif

static const DWORD KILL_CODE = 137, WAIT_BOUND_MS = 3500, DESCENDANT_DRAIN_MS = 500;
struct Identity { DWORD pid; unsigned long long creation; };

static std::wstring quote(const std::wstring& s) {
    if (!s.empty() && s.find_first_of(L" \t\"") == std::wstring::npos) return s;
    std::wstring o=L"\""; size_t n=0;
    for (wchar_t c:s) {
        if(c==L'\\'){++n;continue;}
        if(c==L'"'){o.append(n*2+1,L'\\');o.push_back(L'"');n=0;}
        else{o.append(n,L'\\');n=0;o.push_back(c);}
    }
    o.append(n*2,L'\\');o.push_back(L'"');return o;
}
static std::string esc(const std::string& s) {
    std::string o;
    for(unsigned char c:s){if(c=='\\'||c=='"'){o.push_back('\\');o.push_back((char)c);}
        else if(c=='\n'||c=='\r'||c=='\t')o.push_back(' ');else if(c>=32)o.push_back((char)c);}
    return o;
}
static std::string error_text(const char* phase,DWORD code=GetLastError()){
    char* m=nullptr;FormatMessageA(FORMAT_MESSAGE_ALLOCATE_BUFFER|FORMAT_MESSAGE_FROM_SYSTEM|FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr,code,0,(LPSTR)&m,0,nullptr);
    std::string s=phase;s+=" (Win32 ";s+=std::to_string(code);s+=")";
    if(m){s+=": ";s+=m;LocalFree(m);}return esc(s);
}
static bool active_count(HANDLE job,DWORD& n,std::string& err){
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION a={};
    if(!QueryInformationJobObject(job,JobObjectBasicAccountingInformation,&a,sizeof(a),nullptr)){
        n=MAXDWORD;err=error_text("QueryInformationJobObject");return false;}
    n=a.ActiveProcesses;return true;
}
static std::vector<Identity> members(HANDLE job){
    std::vector<Identity> out;std::vector<unsigned char>b(128*1024);
    if(!QueryInformationJobObject(job,JobObjectBasicProcessIdList,b.data(),(DWORD)b.size(),nullptr))return out;
    DWORD n=*(DWORD*)(b.data()+sizeof(DWORD));size_t cap=(b.size()-8)/sizeof(ULONG_PTR);
    if(n>cap)return out;ULONG_PTR* ids=(ULONG_PTR*)(b.data()+8);
    for(DWORD i=0;i<n;i++){DWORD pid=(DWORD)ids[i];HANDLE p=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE,FALSE,pid);
        if(!p)continue;FILETIME c,e,k,u;
        if(GetProcessTimes(p,&c,&e,&k,&u)&&WaitForSingleObject(p,0)==WAIT_TIMEOUT)
            out.push_back({pid,((unsigned long long)c.dwHighDateTime<<32)|c.dwLowDateTime});
        CloseHandle(p);}
    return out;
}
static std::string members_json(const std::vector<Identity>& v){
    std::ostringstream o;o<<"[";
    for(size_t i=0;i<v.size();i++){if(i)o<<",";o<<"{\"pid\":"<<v[i].pid<<",\"creation\":\""<<v[i].creation<<"\"}";}
    o<<"]";return o.str();
}
static void write_status(const std::wstring& file,const char* phase,bool verified,bool timeout,int exitCode,
    DWORD root,unsigned long long creation,DWORD active,const std::string& reason,const std::vector<Identity>& ids,
    DWORD drainWaitMs=0){
    if(file.empty())return;std::ostringstream o;
    o<<"{\"phase\":\""<<phase<<"\",\"verified\":"<<(verified?"true":"false")<<",\"timedOut\":"<<(timeout?"true":"false")
     <<",\"exitCode\":"<<exitCode<<",\"rootPid\":"<<root<<",\"rootCreation\":\""<<creation
     <<"\",\"activeProcesses\":";
    if(active==MAXDWORD)o<<-1;else o<<active;o<<",\"reason\":\""<<esc(reason)<<"\",\"processes\":"<<members_json(ids)<<"}";
    // Record the bounded natural-exit drain separately from forced cleanup so
    // CI can distinguish a transient parent/child exit race from termination.
    const std::string json=o.str();
    std::string statusJson=json;
    const size_t closing=statusJson.rfind('}');
    if(closing!=std::string::npos)statusJson.insert(closing,",\"drainWaitMs\":"+std::to_string(drainWaitMs));
    HANDLE h=CreateFileW(file.c_str(),GENERIC_WRITE,FILE_SHARE_READ,nullptr,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);
    if(h!=INVALID_HANDLE_VALUE){DWORD n=0;WriteFile(h,statusJson.data(),(DWORD)statusJson.size(),&n,nullptr);FlushFileBuffers(h);CloseHandle(h);}
}
static bool kill_and_wait(HANDLE job,DWORD& active,std::string& reason){
    if(!TerminateJobObject(job,KILL_CODE)){if(!reason.empty())reason+="; ";reason+=error_text("TerminateJobObject");}
    ULONGLONG end=GetTickCount64()+WAIT_BOUND_MS;
    do{std::string e;if(!active_count(job,active,e)){if(!reason.empty())reason+="; ";reason+=e;return false;}
        if(active==0)return true;Sleep(20);}while(GetTickCount64()<end);
    if(!reason.empty())reason+="; ";reason+="Job Object retained "+std::to_string(active)+" active process(es) at shutdown deadline";return false;
}
static int env_delay(){
    wchar_t* p=nullptr;size_t n=0;if(_wdupenv_s(&p,&n,L"FLOWLAB_TEST_JOB_LAUNCH_DELAY_MS")||!p)return 0;
    int x=_wtoi(p);free(p);return x>0?std::min(x,30000):0;
}
static int launch_error(const std::wstring& status,const std::string& why){
    write_status(status,"launch-failure",true,false,1,0,0,0,why,{});
    std::cerr<<why<<"\n";return 1;
}
int wmain(int argc,wchar_t* argv[]){
    if(argc<4){std::cerr<<"Usage: windowsJobRunner.exe <status> <cwd> <exe> [args...]\n";return 2;}
    std::wstring status=argv[1],cwd=argv[2],exe=argv[3],line=quote(exe);
    for(int i=4;i<argc;i++){line.push_back(L' ');line+=quote(argv[i]);}
    HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);
    if(!stop)return launch_error(status,error_text("CreateEventW"));
    std::thread reader([stop](){std::string s;if(std::getline(std::cin,s)&&s=="TERMINATE")SetEvent(stop);});
    reader.detach();
    int delay=env_delay();
    for(int elapsed=0;elapsed<delay;elapsed+=25){
        if(WaitForSingleObject(stop,0)==WAIT_OBJECT_0){write_status(status,"cancelled-before-launch",true,true,KILL_CODE,0,0,0,"Termination arrived before process creation",{});CloseHandle(stop);return KILL_CODE;}
        Sleep(std::min(25,delay-elapsed));
    }
    HANDLE job=CreateJobObjectW(nullptr,nullptr);
    if(!job){CloseHandle(stop);return launch_error(status,error_text("CreateJobObjectW"));}
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION lim={};lim.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if(!SetInformationJobObject(job,JobObjectExtendedLimitInformation,&lim,sizeof(lim))){
        std::string e=error_text("SetInformationJobObject(KILL_ON_JOB_CLOSE)");CloseHandle(job);CloseHandle(stop);return launch_error(status,e);}
    SECURITY_ATTRIBUTES sa={};sa.nLength=sizeof(sa);sa.bInheritHandle=TRUE;
    HANDLE nul=CreateFileW(L"NUL",GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,&sa,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
    if(nul==INVALID_HANDLE_VALUE){std::string e=error_text("CreateFileW(NUL)");CloseHandle(job);CloseHandle(stop);return launch_error(status,e);}
    HANDLE out=GetStdHandle(STD_OUTPUT_HANDLE),err=GetStdHandle(STD_ERROR_HANDLE);
    HANDLE jobList[1]={job};
    SIZE_T bytes=0;InitializeProcThreadAttributeList(nullptr,2,0,&bytes);DWORD last=GetLastError();
    if(!bytes||last!=ERROR_INSUFFICIENT_BUFFER){std::string e=error_text("InitializeProcThreadAttributeList(size)",last);CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return launch_error(status,e);}
    LPPROC_THREAD_ATTRIBUTE_LIST attrs=(LPPROC_THREAD_ATTRIBUTE_LIST)HeapAlloc(GetProcessHeap(),0,bytes);
    HANDLE* handles=(HANDLE*)HeapAlloc(GetProcessHeap(),0,3*sizeof(HANDLE));
    if(!attrs||!handles||!InitializeProcThreadAttributeList(attrs,2,0,&bytes)){
        std::string e=error_text("InitializeProcThreadAttributeList");if(attrs)HeapFree(GetProcessHeap(),0,attrs);if(handles)HeapFree(GetProcessHeap(),0,handles);
        CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return launch_error(status,e);}
    // Assign the new process to the job as part of CreateProcess itself. This
    // closes the dangerous interval before a later AssignProcessToJobObject,
    // including the case where this supervisor crashes during launch.
    if(!UpdateProcThreadAttribute(attrs,0,PROC_THREAD_ATTRIBUTE_JOB_LIST,jobList,sizeof(jobList),nullptr,nullptr)){
        std::string e=error_text("UpdateProcThreadAttribute(JOB_LIST)");DeleteProcThreadAttributeList(attrs);HeapFree(GetProcessHeap(),0,attrs);HeapFree(GetProcessHeap(),0,handles);
        CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return launch_error(status,e);}
    handles[0]=nul;handles[1]=out;handles[2]=err;
    if(!UpdateProcThreadAttribute(attrs,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,handles,3*sizeof(HANDLE),nullptr,nullptr)){
        std::string e=error_text("UpdateProcThreadAttribute(HANDLE_LIST)");DeleteProcThreadAttributeList(attrs);HeapFree(GetProcessHeap(),0,attrs);HeapFree(GetProcessHeap(),0,handles);
        CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return launch_error(status,e);}
    STARTUPINFOEXW si={};si.StartupInfo.cb=sizeof(si);si.StartupInfo.dwFlags=STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput=nul;si.StartupInfo.hStdOutput=out;si.StartupInfo.hStdError=err;si.lpAttributeList=attrs;
    std::vector<wchar_t> mutableLine(line.begin(),line.end());mutableLine.push_back(L'\0');
    PROCESS_INFORMATION pi={};
    // Let CreateProcess resolve a bare command (g++/gdb) using the inherited
    // PATH. A non-null lpApplicationName would require an absolute path.
    if(!CreateProcessW(nullptr,mutableLine.data(),nullptr,nullptr,TRUE,CREATE_SUSPENDED|EXTENDED_STARTUPINFO_PRESENT|CREATE_UNICODE_ENVIRONMENT,
        nullptr,cwd.empty()?nullptr:cwd.c_str(),&si.StartupInfo,&pi)){
        std::string e=error_text("CreateProcessW(CREATE_SUSPENDED, JOB_LIST)");DeleteProcThreadAttributeList(attrs);HeapFree(GetProcessHeap(),0,attrs);HeapFree(GetProcessHeap(),0,handles);
        CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return launch_error(status,e);}
    DWORD root=pi.dwProcessId;FILETIME c,e,k,u;unsigned long long creation=0;
    if(!GetProcessTimes(pi.hProcess,&c,&e,&k,&u)){
        std::string why=error_text("GetProcessTimes(root)");TerminateProcess(pi.hProcess,KILL_CODE);bool ok=WaitForSingleObject(pi.hProcess,WAIT_BOUND_MS)==WAIT_OBJECT_0;
        write_status(status,"identity-capture-failed",ok,false,1,root,0,ok?0:1,why,{});
        CloseHandle(pi.hThread);CloseHandle(pi.hProcess);DeleteProcThreadAttributeList(attrs);HeapFree(GetProcessHeap(),0,attrs);HeapFree(GetProcessHeap(),0,handles);CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return ok?1:4;}
    creation=((unsigned long long)c.dwHighDateTime<<32)|c.dwLowDateTime;
    auto ids=members(job);write_status(status,"assigned-suspended",false,false,0,root,creation,1,"",ids);
    if(WaitForSingleObject(stop,0)==WAIT_OBJECT_0){
        std::string why;DWORD active=0;bool ok=kill_and_wait(job,active,why);
        write_status(status,"cancelled-before-resume",ok,true,KILL_CODE,root,creation,active,why,ids);
        CloseHandle(pi.hThread);CloseHandle(pi.hProcess);DeleteProcThreadAttributeList(attrs);HeapFree(GetProcessHeap(),0,attrs);HeapFree(GetProcessHeap(),0,handles);CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return KILL_CODE;}
    if(ResumeThread(pi.hThread)==(DWORD)-1){
        std::string why=error_text("ResumeThread");DWORD active=0;bool ok=kill_and_wait(job,active,why);
        write_status(status,"resume-failed",ok,false,1,root,creation,active,why,ids);
        CloseHandle(pi.hThread);CloseHandle(pi.hProcess);DeleteProcThreadAttributeList(attrs);HeapFree(GetProcessHeap(),0,attrs);HeapFree(GetProcessHeap(),0,handles);CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return ok?1:4;}
    bool timedOut=false;DWORD exitCode=0,active=0,drainWaitMs=0;std::string reason,phase="running";
    for(;;){
        DWORD w=WaitForSingleObject(pi.hProcess,25);
        if(w==WAIT_OBJECT_0){if(!GetExitCodeProcess(pi.hProcess,&exitCode)){phase="completion-verification-failed";reason=error_text("GetExitCodeProcess");exitCode=1;}break;}
        if(w==WAIT_FAILED){phase="completion-verification-failed";reason=error_text("WaitForSingleObject(root)");exitCode=1;break;}
        if(WaitForSingleObject(stop,0)==WAIT_OBJECT_0){
            wchar_t value[8]={};GetEnvironmentVariableW(L"FLOWLAB_TEST_JOB_IGNORE_TERMINATE",value,8);
            if(wcscmp(value,L"1")==0){ids=members(job);active_count(job,active,reason);write_status(status,"termination-request-ignored-test-seam",false,false,0,root,creation,active,"",ids);ResetEvent(stop);}
            else{timedOut=true;break;}
        }
    }
    if(!timedOut&&phase=="running"){
        // A root can signal exit a few scheduler ticks before a short-lived
        // compiler/debugger helper in the same Job Object. Wait briefly for
        // natural completion; never treat an active descendant as success.
        if(!active_count(job,active,reason))phase="completion-verification-failed";
        else if(active>0){
            const ULONGLONG drainStart=GetTickCount64();
            const ULONGLONG drainDeadline=drainStart+DESCENDANT_DRAIN_MS;
            while(active>0&&GetTickCount64()<drainDeadline){
                if(WaitForSingleObject(stop,0)==WAIT_OBJECT_0){timedOut=true;break;}
                Sleep(10);
                if(!active_count(job,active,reason)){phase="completion-verification-failed";break;}
            }
            drainWaitMs=(DWORD)std::min<ULONGLONG>(GetTickCount64()-drainStart,DESCENDANT_DRAIN_MS);
        }
    }
    if(timedOut){ids=members(job);
        bool ok=kill_and_wait(job,active,reason);phase="job-terminated";
        write_status(status,phase.c_str(),ok,true,KILL_CODE,root,creation,active,reason,ids,drainWaitMs);
        CloseHandle(pi.hThread);CloseHandle(pi.hProcess);DeleteProcThreadAttributeList(attrs);HeapFree(GetProcessHeap(),0,attrs);HeapFree(GetProcessHeap(),0,handles);CloseHandle(nul);CloseHandle(job);CloseHandle(stop);return ok?(int)KILL_CODE:4;
    }
    bool ok=false;
    if(phase=="completion-verification-failed")ok=false;
    else if(!active_count(job,active,reason))phase="completion-verification-failed";
    else if(active==0){ok=true;phase="completed";}
    else{ids=members(job);phase="completed-with-descendants";ok=kill_and_wait(job,active,reason);if(ok){exitCode=1;reason="Root exited before all Job Object descendants; descendants were terminated";}}
    if(!ok&&reason.empty())reason="Job Object did not verify zero active processes";
    write_status(status,phase.c_str(),ok,false,(int)exitCode,root,creation,active,reason,ids,drainWaitMs);
    if(!reason.empty())std::cerr<<reason<<"\n";
    CloseHandle(pi.hThread);CloseHandle(pi.hProcess);DeleteProcThreadAttributeList(attrs);HeapFree(GetProcessHeap(),0,attrs);HeapFree(GetProcessHeap(),0,handles);
    CloseHandle(nul);CloseHandle(job);CloseHandle(stop);
    return ok?(int)exitCode:4;
}
